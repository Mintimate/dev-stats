package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

const starHistoryPageSize = 100

type StarHistoryPoint struct {
	Date  string
	Count int
}

type StarHistoryData struct {
	Owner      string
	Repository string
	FullName   string
	CreatedAt  string
	TotalStars int
	Sampled    bool
	Points     []StarHistoryPoint
}

type githubStarHistoryRepo struct {
	FullName        string `json:"full_name"`
	CreatedAt       string `json:"created_at"`
	StargazersCount int    `json:"stargazers_count"`
}

type githubStargazer struct {
	StarredAt string `json:"starred_at"`
}

type starHistoryPage struct {
	page  int
	stars []githubStargazer
}

// FetchStarHistory reconstructs the star curve from GitHub's timestamped
// stargazer listing. Large repositories are sampled across evenly-spaced API
// pages, matching Star History's bounded-request approach.
func (c *Client) FetchStarHistory(ctx context.Context, owner, repo string, maxRequests int) (StarHistoryData, error) {
	if len(c.tokens) == 0 {
		return StarHistoryData{}, errors.New("no GitHub API tokens found")
	}
	maxRequests = max(2, min(maxRequests, 20))
	path := "/repos/" + url.PathEscape(owner) + "/" + url.PathEscape(repo)

	var metadata githubStarHistoryRepo
	if _, err := c.starHistoryJSON(ctx, path, "application/vnd.github+json", &metadata); err != nil {
		return StarHistoryData{}, err
	}
	data := StarHistoryData{
		Owner:      owner,
		Repository: repo,
		FullName:   metadata.FullName,
		CreatedAt:  metadata.CreatedAt,
		TotalStars: metadata.StargazersCount,
	}
	if data.FullName == "" {
		data.FullName = owner + "/" + repo
	}
	if metadata.StargazersCount == 0 {
		data.Points = []StarHistoryPoint{{Date: dateOnly(metadata.CreatedAt), Count: 0}, {Date: time.Now().UTC().Format("2006-01-02"), Count: 0}}
		return data, nil
	}

	pageCount := (metadata.StargazersCount + starHistoryPageSize - 1) / starHistoryPageSize
	pages := starHistorySamplePages(pageCount, maxRequests)
	data.Sampled = pageCount > maxRequests

	results := make(chan starHistoryPage, len(pages))
	errs := make(chan error, len(pages))
	var wg sync.WaitGroup
	for _, page := range pages {
		page := page
		wg.Add(1)
		go func() {
			defer wg.Done()
			var stars []githubStargazer
			pagePath := fmt.Sprintf("%s/stargazers?per_page=%d&page=%d", path, starHistoryPageSize, page)
			if _, err := c.starHistoryJSON(ctx, pagePath, "application/vnd.github.star+json", &stars); err != nil {
				errs <- err
				return
			}
			results <- starHistoryPage{page: page, stars: stars}
		}()
	}
	wg.Wait()
	close(results)
	close(errs)
	if err := <-errs; err != nil {
		return StarHistoryData{}, err
	}

	fetched := make([]starHistoryPage, 0, len(pages))
	for result := range results {
		fetched = append(fetched, result)
	}
	sort.Slice(fetched, func(i, j int) bool { return fetched[i].page < fetched[j].page })
	if len(fetched) == 0 || len(fetched[0].stars) == 0 {
		return StarHistoryData{}, errors.New("GitHub returned no timestamped stargazer data")
	}

	byDate := make(map[string]int)
	if data.Sampled {
		for _, result := range fetched {
			if len(result.stars) == 0 {
				continue
			}
			count := min((result.page-1)*starHistoryPageSize+1, metadata.StargazersCount)
			byDate[dateOnly(result.stars[0].StarredAt)] = count
		}
	} else {
		for _, result := range fetched {
			for index, star := range result.stars {
				count := min((result.page-1)*starHistoryPageSize+index+1, metadata.StargazersCount)
				byDate[dateOnly(star.StarredAt)] = count
			}
		}
	}
	byDate[time.Now().UTC().Format("2006-01-02")] = metadata.StargazersCount

	dates := make([]string, 0, len(byDate))
	for date := range byDate {
		if date != "" {
			dates = append(dates, date)
		}
	}
	sort.Strings(dates)
	data.Points = make([]StarHistoryPoint, 0, len(dates))
	for _, date := range dates {
		data.Points = append(data.Points, StarHistoryPoint{Date: date, Count: byDate[date]})
	}
	return data, nil
}

func starHistorySamplePages(pageCount, limit int) []int {
	if pageCount <= limit {
		pages := make([]int, pageCount)
		for i := range pages {
			pages[i] = i + 1
		}
		return pages
	}
	seen := make(map[int]bool, limit)
	pages := make([]int, 0, limit)
	for i := 0; i < limit; i++ {
		page := 1 + int(float64(i)*float64(pageCount-1)/float64(limit-1)+0.5)
		if !seen[page] {
			seen[page] = true
			pages = append(pages, page)
		}
	}
	return pages
}

func dateOnly(value string) string {
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.UTC().Format("2006-01-02")
	}
	if len(value) >= 10 {
		return value[:10]
	}
	return value
}

func (c *Client) starHistoryJSON(ctx context.Context, path, accept string, target any) (http.Header, error) {
	var lastErr error
	for _, token := range c.tokens {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubRESTEndpoint+path, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", accept)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-GitHub-Api-Version", "2026-03-10")
		req.Header.Set("User-Agent", "dev-stats-star-history")
		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		payload, readErr := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		_ = resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}
		if resp.StatusCode == http.StatusOK {
			if err := json.Unmarshal(payload, target); err != nil {
				return nil, err
			}
			return resp.Header.Clone(), nil
		}

		switch resp.StatusCode {
		case http.StatusUnauthorized:
			lastErr = errors.New("bad GitHub credentials")
		case http.StatusForbidden:
			if bytes.Contains(bytes.ToLower(payload), []byte("rate limit")) {
				lastErr = errors.New("GitHub API rate limited")
			} else {
				lastErr = errors.New("GitHub denied access to stargazer history")
			}
		case http.StatusNotFound:
			lastErr = errors.New("repository not found or GitHub denied stargazer access; the token must belong to an admin or collaborator")
		default:
			message := strings.TrimSpace(resp.Status)
			lastErr = fmt.Errorf("GitHub API request failed: %s", message)
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, errors.New("GitHub API request failed")
}
