package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

var cnbAPIEndpoint = "https://api.cnb.cool"
var cnbWebEndpoint = "https://cnb.cool"

type CNBClient struct {
	httpClient *http.Client
	token      string
}

type cnbUser struct {
	Username        string `json:"username"`
	Nickname        string `json:"nickname"`
	Avatar          string `json:"avatar"`
	CreatedAt       string `json:"created_at"`
	FollowerCount   int    `json:"follower_count"`
	FollowCount     int    `json:"follow_count"`
	PublicRepoCount int    `json:"public_repo_count"`
	RepoCount       int    `json:"repo_count"`
	StarsCount      int    `json:"stars_count"`
	IsGroup         bool   `json:"-"`
}

type cnbGroup struct {
	Name            string `json:"name"`
	Path            string `json:"path"`
	Description     string `json:"description"`
	CreatedAt       string `json:"created_at"`
	MemberCount     int    `json:"member_count"`
	SubRepoCount    int    `json:"sub_repo_count"`
	AllSubRepoCount int    `json:"all_sub_repo_count"`
}

type cnbLanguage struct {
	Language string `json:"language"`
	Color    string `json:"color"`
}

type cnbRepo struct {
	Name            string      `json:"name"`
	Path            string      `json:"path"`
	Description     string      `json:"description"`
	StarCount       int         `json:"star_count"`
	ForkCount       int         `json:"fork_count"`
	Status          int         `json:"status"`
	Language        string      `json:"language"`
	Languages       cnbLanguage `json:"languages"`
	SecondLanguages cnbLanguage `json:"second_languages"`
}

type cnbActivity struct {
	CommitCount      int               `json:"commit_count"`
	PullRequestCount int               `json:"pull_request_count"`
	IssuesCount      int               `json:"issues_count"`
	CodeReviewCount  int               `json:"code_review_count"`
	Repos            []cnbActivityRepo `json:"repos"`
	Commits          []cnbActivityRepo `json:"commits"`
	PullRequests     []cnbActivityRepo `json:"pull_requests"`
	Issues           []cnbActivityRepo `json:"issues"`
}

type cnbActivityRepo struct {
	Time            int                `json:"time"`
	CreateAt        string             `json:"create_at"`
	Detail          *cnbActivityDetail `json:"detail"`
	ExposedRepoPath string             `json:"exposed_repo_path"`
}

type cnbActivityDetail struct {
	Path string `json:"path"`
}

type cnbCalendarDay struct {
	Score        int `json:"score"`
	CommitCount  int `json:"commit_count"`
	PRCount      int `json:"pr_count"`
	IssuesCount  int `json:"issues_count"`
	ValidPRCount int `json:"valid_pr_count"`
	ValidCRCount int `json:"valid_cr_count"`
}

func NewCNBClient() *CNBClient {
	return &CNBClient{
		httpClient: &http.Client{Timeout: 12 * time.Second},
		token:      strings.TrimSpace(os.Getenv("CNB_API_TOKEN")),
	}
}

func (c *CNBClient) getJSON(ctx context.Context, path string, target any) error {
	if c.token == "" {
		return errors.New("no CNB API token found; configure CNB_API_TOKEN")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(cnbAPIEndpoint, "/")+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.cnb.api+json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		switch resp.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return errors.New("bad CNB credentials or insufficient token permissions")
		case http.StatusNotFound:
			return errors.New("CNB user or repository not found")
		case http.StatusTooManyRequests:
			return errors.New("CNB API rate limited")
		default:
			message := strings.TrimSpace(string(body))
			if message == "" {
				message = resp.Status
			}
			return fmt.Errorf("CNB API returned %s", message)
		}
	}
	return json.NewDecoder(resp.Body).Decode(target)
}

func (c *CNBClient) getWebJSON(ctx context.Context, path string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(cnbWebEndpoint, "/")+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.cnb.web+json")
	req.Header.Set("User-Agent", "dev-stats/1.0")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		if resp.StatusCode == http.StatusNotFound {
			return errors.New("CNB user or repository not found")
		}
		if resp.StatusCode == http.StatusTooManyRequests {
			return errors.New("CNB public API rate limited")
		}
		return fmt.Errorf("CNB public API returned %s", resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(target)
}

func cnbPath(value string) string {
	parts := strings.Split(strings.Trim(value, "/"), "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}

func (c *CNBClient) fetchUser(ctx context.Context, username string) (cnbUser, error) {
	var user cnbUser
	err := c.getWebJSON(ctx, "/users/"+cnbPath(username), &user)
	if err != nil && (strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "not found")) {
		var group cnbGroup
		errGroup := c.getWebJSON(ctx, "/"+cnbPath(username), &group)
		if errGroup == nil {
			return cnbUser{
				Username:        group.Path,
				Nickname:        group.Name,
				Avatar:          "",
				CreatedAt:       group.CreatedAt,
				FollowerCount:   0,
				FollowCount:     0,
				PublicRepoCount: group.AllSubRepoCount,
				RepoCount:       group.SubRepoCount,
				StarsCount:      0,
				IsGroup:         true,
			}, nil
		}
	}
	return user, err
}

func (c *CNBClient) fetchRepos(ctx context.Context, username string) ([]cnbRepo, error) {
	var repos []cnbRepo
	query := url.Values{"page": {"1"}, "page_size": {"100"}, "role": {"Owner"}, "status": {"active"}}
	err := c.getWebJSON(ctx, "/users/"+cnbPath(username)+"/repos?"+query.Encode(), &repos)
	if err != nil && (strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "not found")) {
		var groupRepos []cnbRepo
		errGroup := c.getWebJSON(ctx, "/"+cnbPath(username)+"/-/repos?"+query.Encode(), &groupRepos)
		if errGroup == nil {
			return groupRepos, nil
		}
	}
	return repos, err
}

func (c *CNBClient) fetchCalendar(ctx context.Context, username string, year int) (map[string]cnbCalendarDay, error) {
	if year > 0 && (year > time.Now().Year() || year < 1970) {
		return nil, fmt.Errorf("invalid commits_year %d", year)
	}
	query := ""
	if year > 0 {
		query = "?year=" + strconv.Itoa(year)
	}
	var calendar map[string]cnbCalendarDay
	err := c.getWebJSON(ctx, "/users/"+cnbPath(username)+"/calendar"+query, &calendar)
	if err != nil && (strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "not found")) {
		return make(map[string]cnbCalendarDay), nil
	}
	return calendar, err
}

func aggregateCNBCalendar(calendar map[string]cnbCalendarDay) cnbActivity {
	var total cnbActivity
	for _, day := range calendar {
		total.CommitCount += day.CommitCount
		total.PullRequestCount += day.PRCount
		total.IssuesCount += day.IssuesCount
		total.CodeReviewCount += day.ValidCRCount
	}
	return total
}

func (c *CNBClient) FetchStats(ctx context.Context, q StatsQuery) (StatsData, error) {
	year := time.Now().Year()
	if q.CommitsYear != "" {
		parsed, err := strconv.Atoi(q.CommitsYear)
		if err != nil || len(q.CommitsYear) != 4 {
			return StatsData{}, errors.New("commits_year must be a four-digit year")
		}
		year = parsed
	}

	user, err := c.fetchUser(ctx, q.Username)
	if err != nil {
		return StatsData{}, err
	}
	repos, err := c.fetchRepos(ctx, q.Username)
	if err != nil {
		return StatsData{}, err
	}
	calendar, err := c.fetchCalendar(ctx, q.Username, year)
	if err != nil {
		return StatsData{}, err
	}
	activity := aggregateCNBCalendar(calendar)
	// 复制一份再 append，避免共享 q.ExcludeRepos 的底层数组（若 StatsQuery 被复用会有数据竞争隐患）。
	excluded := setFromStrings(append(append([]string{}, q.ExcludeRepos...), parseCSV(os.Getenv("EXCLUDE_REPO"))...))
	totalStars, repositoryCount := 0, 0
	for _, repo := range repos {
		if excluded[repo.Name] || excluded[strings.ToLower(repo.Name)] {
			continue
		}
		totalStars += repo.StarCount
		repositoryCount++
	}
	if len(excluded) == 0 && !user.IsGroup {
		totalStars = user.StarsCount
		if user.PublicRepoCount > 0 {
			repositoryCount = user.PublicRepoCount
		}
	}
	name := user.Nickname
	if name == "" {
		name = user.Username
	}
	level, percentile := calculateRank(false, activity.CommitCount, activity.PullRequestCount, activity.IssuesCount, activity.CodeReviewCount, totalStars, user.FollowerCount)
	return StatsData{
		Platform:       "CNB",
		Name:           name,
		TotalCommits:   activity.CommitCount,
		TotalPRs:       activity.PullRequestCount,
		TotalReviews:   activity.CodeReviewCount,
		TotalIssues:    activity.IssuesCount,
		TotalStars:     totalStars,
		Followers:      user.FollowerCount,
		Repositories:   repositoryCount,
		RankLevel:      level,
		RankPercentile: percentile,
	}, nil
}

func (c *CNBClient) FetchTopLanguages(ctx context.Context, username string, excludeRepos []string, sizeWeight float64, countWeight float64) ([]LanguageStat, error) {
	repos, err := c.fetchRepos(ctx, username)
	if err != nil {
		return nil, err
	}
	excluded := setFromStrings(append(excludeRepos, parseCSV(os.Getenv("EXCLUDE_REPO"))...))
	stats := map[string]*LanguageStat{}
	for _, repo := range repos {
		if excluded[repo.Name] || excluded[strings.ToLower(repo.Name)] {
			continue
		}
		languages := []cnbLanguage{repo.Languages, repo.SecondLanguages}
		if languages[0].Language == "" && repo.Language != "" {
			languages[0].Language = repo.Language
		}
		seen := map[string]bool{}
		for index, language := range languages {
			if language.Language == "" || seen[language.Language] {
				continue
			}
			seen[language.Language] = true
			stat := stats[language.Language]
			if stat == nil {
				stat = &LanguageStat{Name: language.Language, Color: defaultColor(language.Color, colorForName(language.Language))}
				stats[language.Language] = stat
			}
			weight := 1.0
			if index == 0 {
				weight = 2
			}
			stat.Size += weight
			stat.Count++
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

func (c *CNBClient) fetchRepo(ctx context.Context, username, repo string) (cnbRepo, error) {
	path := strings.Trim(repo, "/")
	if !strings.Contains(path, "/") {
		repos, err := c.fetchRepos(ctx, username)
		if err != nil {
			return cnbRepo{}, err
		}
		for _, candidate := range repos {
			if strings.EqualFold(candidate.Name, path) {
				path = candidate.Path
				if strings.HasPrefix(strings.ToLower(candidate.Path), strings.ToLower(strings.Trim(username, "/"))+"/") {
					break
				}
			}
		}
		if !strings.Contains(path, "/") {
			path = strings.Trim(username, "/") + "/" + path
		}
	}
	var result cnbRepo
	err := c.getWebJSON(ctx, "/"+cnbPath(path), &result)
	if err != nil && c.token != "" {
		err = c.getJSON(ctx, "/"+cnbPath(path), &result)
	}
	return result, err
}

func (c *CNBClient) FetchRepo(ctx context.Context, username, repo string) (RepoData, error) {
	result, err := c.fetchRepo(ctx, username, repo)
	if err != nil {
		return RepoData{}, err
	}
	language := result.Languages
	if language.Language == "" {
		language.Language = result.Language
	}
	return RepoData{
		Name:          result.Name,
		NameWithOwner: result.Path,
		Description:   result.Description,
		PrimaryLang:   language.Language,
		LanguageColor: defaultColor(language.Color, colorForName(language.Language)),
		Stars:         result.StarCount,
		Forks:         result.ForkCount,
		IsArchived:    result.Status == 1,
	}, nil
}

func (c *CNBClient) FetchProfileSummary(ctx context.Context, username string) (ProfileSummaryData, error) {
	user, err := c.fetchUser(ctx, username)
	if err != nil {
		return ProfileSummaryData{}, err
	}
	repos, err := c.fetchRepos(ctx, username)
	if err != nil {
		return ProfileSummaryData{}, err
	}
	calendar, err := c.fetchCalendar(ctx, username, time.Now().Year())
	if err != nil {
		return ProfileSummaryData{}, err
	}
	activity := aggregateCNBCalendar(calendar)
	stars, forks := 0, 0
	for _, repo := range repos {
		stars += repo.StarCount
		forks += repo.ForkCount
	}
	name := user.Nickname
	if name == "" {
		name = user.Username
	}
	activeYears := []int{}
	if activity.CommitCount+activity.PullRequestCount+activity.IssuesCount > 0 {
		activeYears = append(activeYears, time.Now().Year())
	}
	return ProfileSummaryData{
		Platform:     "CNB",
		Name:         name,
		Login:        user.Username,
		AvatarURL:    user.Avatar,
		Followers:    user.FollowerCount,
		Following:    user.FollowCount,
		Repositories: user.PublicRepoCount,
		TotalStars:   stars,
		TotalForks:   forks,
		TotalCommits: activity.CommitCount,
		TotalPRs:     activity.PullRequestCount,
		TotalIssues:  activity.IssuesCount,
		ActiveYears:  activeYears,
		MemberSince:  user.CreatedAt,
	}, nil
}

func (c *CNBClient) FetchRepoLanguages(ctx context.Context, username, repo string, count int) (RepoLanguagesData, error) {
	result, err := c.fetchRepo(ctx, username, repo)
	if err != nil {
		return RepoLanguagesData{}, err
	}
	languages := []LanguageStat{}
	for _, language := range []cnbLanguage{result.Languages, result.SecondLanguages} {
		if language.Language == "" {
			continue
		}
		languages = append(languages, LanguageStat{Name: language.Language, Color: defaultColor(language.Color, colorForName(language.Language)), Size: 1, Count: 1})
	}
	if count > 0 && len(languages) > count {
		languages = languages[:count]
	}
	return RepoLanguagesData{Name: result.Name, NameWithOwner: result.Path, TotalSize: len(languages), TotalLabel: fmt.Sprintf("%d languages", len(languages)), Languages: languages}, nil
}

func (c *CNBClient) FetchContributionCalendar(ctx context.Context, username string) (string, []ContributionDay, error) {
	calendar, err := c.fetchCalendar(ctx, username, 0)
	if err != nil {
		return "", nil, err
	}
	keys := make([]string, 0, len(calendar))
	for key := range calendar {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	days := make([]ContributionDay, 0, len(keys))
	for _, key := range keys {
		date, err := time.Parse("20060102", key)
		if err != nil {
			continue
		}
		day := calendar[key]
		count := day.CommitCount + day.PRCount + day.IssuesCount + day.ValidCRCount
		days = append(days, ContributionDay{Date: date.Format("2006-01-02"), Count: count})
	}
	user, err := c.fetchUser(ctx, username)
	if err != nil {
		return "", nil, err
	}
	name := user.Nickname
	if name == "" {
		name = user.Username
	}
	return name, days, nil
}

func (c *CNBClient) FetchRecentActivity(ctx context.Context, username string, count int) ([]ActivityItem, error) {
	var activity cnbActivity
	if err := c.getWebJSON(ctx, "/users/"+cnbPath(username)+"/activities", &activity); err != nil {
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "not found") {
			return nil, nil
		}
		return nil, err
	}
	items := make([]ActivityItem, 0, count)
	appendItems := func(entries []cnbActivityRepo, kind, label string) {
		for _, entry := range entries {
			if len(items) >= count {
				return
			}
			path := entry.ExposedRepoPath
			if entry.Detail != nil && entry.Detail.Path != "" {
				path = entry.Detail.Path
			}
			if path == "" {
				continue
			}
			title := fmt.Sprintf("%d %s in %s", entry.Time, label, path)
			items = append(items, ActivityItem{Type: kind, Repo: path, Title: title, URL: "https://cnb.cool/" + path, CreatedAt: entry.CreateAt})
		}
	}
	appendItems(activity.Commits, "commit", "commits")
	appendItems(activity.PullRequests, "pull-request", "pull requests")
	appendItems(activity.Issues, "issue", "issues")
	return items, nil
}

func (c *CNBClient) FetchOrganization(context.Context, string) (OrganizationData, error) {
	return OrganizationData{}, errors.New("organization stats are not available for CNB")
}

func (c *CNBClient) HasUsableToken(ctx context.Context) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(cnbWebEndpoint, "/")+"/robots.txt", nil)
	if err != nil {
		return false
	}
	req.Header.Set("User-Agent", "dev-stats/1.0")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 500
}

func (c *CNBClient) TokenInfo(ctx context.Context) map[string]any {
	configured := c.token != ""
	return map[string]any{"platform": "cnb", "mode": "public-web", "token_required": false, "token_configured": configured, "usable": c.HasUsableToken(ctx)}
}
