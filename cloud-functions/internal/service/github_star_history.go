package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	starHistoryPageSize = 30
	starHistoryMaxPage  = 100
)

type StarHistoryPoint struct {
	Date  time.Time
	Count int
}

type StarHistoryData struct {
	FullName   string
	TotalStars int
	Points     []StarHistoryPoint
}

type starHistoryRepository struct {
	ID         int64     `json:"id"`
	FullName   string    `json:"full_name"`
	CreatedAt  time.Time `json:"created_at"`
	Private    bool      `json:"private"`
	Visibility string    `json:"visibility"`
}

func (r starHistoryRepository) isPublic() bool {
	return r.ID > 0 && r.FullName != "" && !r.CreatedAt.IsZero() && !r.Private && r.Visibility == "public"
}

type starHistoryWeek struct {
	Week  int64 `json:"week"`
	Total int   `json:"total"`
	Days  []int `json:"days"`
}

// FetchStarHistory builds a cumulative curve from GitHub's daily counts of
// stars that are still active. The history API paginates from newest to oldest.
func (c *Client) FetchStarHistory(ctx context.Context, owner, repo string) (StarHistoryData, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	var repository starHistoryRepository
	path := "/repos/" + url.PathEscape(owner) + "/" + url.PathEscape(repo)
	if _, err := c.starHistoryJSON(ctx, path, &repository); err != nil {
		return StarHistoryData{}, err
	}
	if !repository.isPublic() {
		return StarHistoryData{}, errors.New("repository not found")
	}

	// Pin all pages to the verified repository even if its name changes mid-request.
	repositoryPath := fmt.Sprintf("/repositories/%d", repository.ID)
	var weeks []starHistoryWeek
	for page := 1; ; page++ {
		var batch []starHistoryWeek
		historyPath := fmt.Sprintf("%s/stargazers/history?per_page=%d&page=%d", repositoryPath, starHistoryPageSize, page)
		header, err := c.starHistoryJSON(ctx, historyPath, &batch)
		if err != nil {
			return StarHistoryData{}, err
		}
		if len(batch) == 0 || len(batch) > starHistoryPageSize {
			return StarHistoryData{}, errors.New("GitHub returned an invalid star history page")
		}
		weeks = append(weeks, batch...)
		if !strings.Contains(strings.Join(header.Values("Link"), ","), `rel="next"`) {
			break
		}
		if page == starHistoryMaxPage {
			return StarHistoryData{}, errors.New("GitHub star history exceeds the API pagination limit")
		}
	}

	// Even a zero-star repository has buckets through its creation week. Allow
	// one day of drift because GitHub's calendar boundaries need not use UTC.
	if oldest := time.Unix(weeks[len(weeks)-1].Week, 0); oldest.After(repository.CreatedAt.Add(24 * time.Hour)) {
		return StarHistoryData{}, errors.New("GitHub returned incomplete star history")
	}

	return buildStarHistory(repository, weeks, time.Now())
}

func buildStarHistory(repository starHistoryRepository, weeks []starHistoryWeek, now time.Time) (StarHistoryData, error) {
	data := StarHistoryData{
		FullName: repository.FullName,
		Points:   make([]StarHistoryPoint, 0, len(weeks)*7),
	}
	created := repository.CreatedAt.UTC().Truncate(24 * time.Hour)
	today := now.UTC().Truncate(24 * time.Hour)
	tomorrow := today.AddDate(0, 0, 1)
	var previousWeek time.Time
	for index := len(weeks) - 1; index >= 0; index-- {
		week := weeks[index]
		weekStart := time.Unix(week.Week, 0).UTC()
		if week.Week <= 0 || len(week.Days) != 7 {
			return StarHistoryData{}, errors.New("GitHub returned invalid star history weeks")
		}
		// GitHub's calendar boundaries can shift relative to UTC.
		if !previousWeek.IsZero() {
			gap := weekStart.Sub(previousWeek)
			if gap <= 6*24*time.Hour || gap >= 8*24*time.Hour {
				return StarHistoryData{}, errors.New("GitHub returned nonconsecutive star history weeks")
			}
		}
		previousWeek = weekStart
		weeklyCount := 0
		for offset, stars := range week.Days {
			if stars < 0 {
				return StarHistoryData{}, errors.New("GitHub returned an invalid star history count")
			}
			weeklyCount += stars
			date := weekStart.AddDate(0, 0, offset)
			if stars == 0 && (date.Before(created) || !date.Before(tomorrow)) {
				continue
			}
			data.TotalStars += stars
			data.Points = append(data.Points, StarHistoryPoint{Date: date, Count: data.TotalStars})
		}
		if weeklyCount != week.Total {
			return StarHistoryData{}, errors.New("GitHub returned inconsistent star history counts")
		}
	}
	return data, nil
}

// The public history route can fan out into many requests. Keep those requests
// anonymous to isolate their rate limit from the tokens used by other cards.
func (c *Client) starHistoryJSON(ctx context.Context, path string, target any) (http.Header, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubRESTEndpoint+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2026-03-10")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		if err := json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(target); err != nil {
			return nil, err
		}
		return resp.Header, nil
	case http.StatusNotFound:
		return nil, errors.New("repository not found")
	case http.StatusTooManyRequests:
		return nil, errors.New("GitHub API rate limited")
	case http.StatusForbidden:
		if resp.Header.Get("Retry-After") != "" || resp.Header.Get("X-RateLimit-Remaining") == "0" {
			return nil, errors.New("GitHub API rate limited")
		}
	}
	return nil, fmt.Errorf("GitHub REST API returned %s", resp.Status)
}
