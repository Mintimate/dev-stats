package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

type count struct {
	TotalCount int `json:"totalCount"`
}

func (c *Client) FetchRepo(ctx context.Context, username string, repo string) (RepoData, error) {
	query := `
fragment RepoInfo on Repository {
  name
  nameWithOwner
  isPrivate
  isArchived
  isTemplate
  stargazers { totalCount }
  description
  primaryLanguage { color name }
  forkCount
}
query getRepo($login: String!, $repo: String!) {
  repository(owner: $login, name: $repo) { ...RepoInfo }
}`
	var response struct {
		Repository struct {
			Name            string `json:"name"`
			NameWithOwner   string `json:"nameWithOwner"`
			IsPrivate       bool   `json:"isPrivate"`
			IsArchived      bool   `json:"isArchived"`
			IsTemplate      bool   `json:"isTemplate"`
			Stargazers      count  `json:"stargazers"`
			Description     string `json:"description"`
			PrimaryLanguage struct {
				Color string `json:"color"`
				Name  string `json:"name"`
			} `json:"primaryLanguage"`
			ForkCount int `json:"forkCount"`
		} `json:"repository"`
	}
	if err := c.graphQL(ctx, query, map[string]any{"login": username, "repo": repo}, &response); err != nil {
		return RepoData{}, err
	}
	source := response.Repository
	if source.Name == "" || source.IsPrivate {
		return RepoData{}, errors.New("repository not found")
	}
	return RepoData{
		Name:          source.Name,
		NameWithOwner: source.NameWithOwner,
		Description:   source.Description,
		PrimaryLang:   source.PrimaryLanguage.Name,
		LanguageColor: defaultColor(source.PrimaryLanguage.Color, "#858585"),
		Stars:         source.Stargazers.TotalCount,
		Forks:         source.ForkCount,
		IsArchived:    source.IsArchived,
		IsTemplate:    source.IsTemplate,
	}, nil
}

func (c *Client) FetchGist(ctx context.Context, id string) (GistData, error) {
	query := `
query gistInfo($gistName: String!) {
  viewer {
    gist(name: $gistName) {
      description
      owner { login }
      stargazerCount
      forks { totalCount }
      files { name size language { name } }
    }
  }
}`
	var response struct {
		Viewer struct {
			Gist struct {
				Description    string `json:"description"`
				StargazerCount int    `json:"stargazerCount"`
				Owner          struct {
					Login string `json:"login"`
				} `json:"owner"`
				Forks count `json:"forks"`
				Files []struct {
					Name     string `json:"name"`
					Size     int    `json:"size"`
					Language struct {
						Name string `json:"name"`
					} `json:"language"`
				} `json:"files"`
			} `json:"gist"`
		} `json:"viewer"`
	}
	if err := c.graphQL(ctx, query, map[string]any{"gistName": id}, &response); err != nil {
		return GistData{}, err
	}
	if len(response.Viewer.Gist.Files) == 0 {
		return GistData{}, errors.New("gist not found")
	}
	first := response.Viewer.Gist.Files[0]
	primaryLanguage := calculatePrimaryGistLanguage(response.Viewer.Gist.Files)
	return GistData{
		Name:          first.Name,
		NameWithOwner: response.Viewer.Gist.Owner.Login + "/" + first.Name,
		Description:   response.Viewer.Gist.Description,
		Language:      primaryLanguage,
		Stars:         response.Viewer.Gist.StargazerCount,
		Forks:         response.Viewer.Gist.Forks.TotalCount,
	}, nil
}

func calculatePrimaryGistLanguage(files []struct {
	Name     string `json:"name"`
	Size     int    `json:"size"`
	Language struct {
		Name string `json:"name"`
	} `json:"language"`
}) string {
	weights := map[string]int{}
	for _, file := range files {
		if file.Language.Name != "" {
			weights[file.Language.Name] += file.Size
		}
	}
	bestName := ""
	bestSize := -1
	for name, size := range weights {
		if size > bestSize {
			bestName = name
			bestSize = size
		}
	}
	return bestName
}

type repoOwner struct {
	Repository struct {
		Name            string `json:"name"`
		NameWithOwner   string `json:"nameWithOwner"`
		IsPrivate       bool   `json:"isPrivate"`
		IsArchived      bool   `json:"isArchived"`
		IsTemplate      bool   `json:"isTemplate"`
		Stargazers      count  `json:"stargazers"`
		Description     string `json:"description"`
		PrimaryLanguage struct {
			Color string `json:"color"`
			Name  string `json:"name"`
		} `json:"primaryLanguage"`
		ForkCount int `json:"forkCount"`
	} `json:"repository"`
}

func FetchWakatime(ctx context.Context, username string, apiDomain string) ([]WakatimeLanguage, error) {
	if apiDomain == "" {
		apiDomain = "wakatime.com"
	}
	apiDomain = strings.TrimRight(apiDomain, "/")
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://"+apiDomain+"/api/v1/users/"+username+"/stats?is_including_today=true", nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 12 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return nil, fmt.Errorf("could not resolve WakaTime user %q", username)
	}
	var payload struct {
		Data struct {
			Languages []WakatimeLanguage `json:"languages"`
		} `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload.Data.Languages, nil
}

func (c *Client) FetchTopLanguages(ctx context.Context, username string, excludeRepos []string, sizeWeight float64, countWeight float64) ([]LanguageStat, error) {
	query := `
query userInfo($login: String!) {
  user(login: $login) {
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
      nodes {
        name
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { color name } }
        }
      }
    }
  }
}`
	var response struct {
		User struct {
			Repositories struct {
				Nodes []struct {
					Name      string `json:"name"`
					Languages struct {
						Edges []struct {
							Size float64 `json:"size"`
							Node struct {
								Color string `json:"color"`
								Name  string `json:"name"`
							} `json:"node"`
						} `json:"edges"`
					} `json:"languages"`
				} `json:"nodes"`
			} `json:"repositories"`
		} `json:"user"`
	}
	if err := c.graphQL(ctx, query, map[string]any{"login": username}, &response); err != nil {
		return nil, err
	}

	excluded := setFromStrings(append(excludeRepos, parseCSV(os.Getenv("EXCLUDE_REPO"))...))
	stats := map[string]*LanguageStat{}
	for _, repo := range response.User.Repositories.Nodes {
		if excluded[repo.Name] {
			continue
		}
		seenInRepo := map[string]bool{}
		for _, edge := range repo.Languages.Edges {
			if edge.Node.Name == "" {
				continue
			}
			stat := stats[edge.Node.Name]
			if stat == nil {
				stat = &LanguageStat{Name: edge.Node.Name, Color: defaultColor(edge.Node.Color, colorForName(edge.Node.Name))}
				stats[edge.Node.Name] = stat
			}
			stat.Size += edge.Size
			if !seenInRepo[edge.Node.Name] {
				stat.Count++
				seenInRepo[edge.Node.Name] = true
			}
		}
	}

	result := make([]LanguageStat, 0, len(stats))
	for _, stat := range stats {
		score := math.Pow(stat.Size, sizeWeight) * math.Pow(float64(max(1, stat.Count)), countWeight)
		result = append(result, LanguageStat{Name: stat.Name, Color: stat.Color, Size: score, Count: stat.Count})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Size > result[j].Size })
	return result, nil
}

func calculateRank(allCommits bool, commits, prs, issues, reviews, stars, followers int) (string, float64) {
	commitsMedian := 250.0
	if allCommits {
		commitsMedian = 1000
	}
	expCDF := func(x float64) float64 { return 1 - math.Pow(2, -x) }
	logNormalCDF := func(x float64) float64 { return x / (1 + x) }
	rank := 1 - (2*expCDF(float64(commits)/commitsMedian)+3*expCDF(float64(prs)/50)+expCDF(float64(issues)/25)+expCDF(float64(reviews)/2)+4*logNormalCDF(float64(stars)/50)+logNormalCDF(float64(followers)/10))/(2+3+1+1+4+1)
	thresholds := []float64{1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100}
	levels := []string{"S", "A+", "A", "A-", "B+", "B", "B-", "C+", "C"}
	percentile := rank * 100
	for i, threshold := range thresholds {
		if percentile <= threshold {
			return levels[i], percentile
		}
	}
	return "C", percentile
}
