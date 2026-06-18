package handler

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"math"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	githubGraphQLEndpoint = "https://api.github.com/graphql"
	githubRESTEndpoint    = "https://api.github.com"
	errorCacheSeconds     = 10 * 60
)

type cachePolicy struct {
	Default int
	Min     int
	Max     int
}

var cachePolicies = map[string]cachePolicy{
	"stats":    {Default: 24 * 60 * 60, Min: 12 * 60 * 60, Max: 2 * 24 * 60 * 60},
	"topLangs": {Default: 6 * 24 * 60 * 60, Min: 2 * 24 * 60 * 60, Max: 10 * 24 * 60 * 60},
	"pin":      {Default: 10 * 24 * 60 * 60, Min: 24 * 60 * 60, Max: 10 * 24 * 60 * 60},
	"gist":     {Default: 2 * 24 * 60 * 60, Min: 24 * 60 * 60, Max: 10 * 24 * 60 * 60},
	"wakatime": {Default: 24 * 60 * 60, Min: 12 * 60 * 60, Max: 2 * 24 * 60 * 60},
}

type graphQLResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []graphQLError  `json:"errors,omitempty"`
}

type graphQLError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
}

type gitHubClient struct {
	httpClient *http.Client
	tokens     []string
}

type statsData struct {
	Name                     string
	TotalCommits             int
	TotalPRs                 int
	TotalPRsMerged           int
	MergedPRsPercentage      float64
	TotalReviews             int
	TotalIssues              int
	TotalStars               int
	TotalDiscussionsStarted  int
	TotalDiscussionsAnswered int
	ContributedTo            int
	Followers                int
	Repositories             int
	RankLevel                string
	RankPercentile           float64
}

type repoData struct {
	Name          string
	NameWithOwner string
	Description   string
	PrimaryLang   string
	LanguageColor string
	Stars         int
	Forks         int
	IsArchived    bool
	IsTemplate    bool
}

type languageStat struct {
	Name  string
	Color string
	Size  float64
	Count int
}

type gistData struct {
	Name          string
	NameWithOwner string
	Description   string
	Language      string
	Stars         int
	Forks         int
}

type wakatimeLanguage struct {
	Name    string  `json:"name"`
	Percent float64 `json:"percent"`
	Text    string  `json:"text"`
}

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		writeHomePage(w, r)
		return
	}

	path := normalizeAPIPath(r.URL.Path)
	switch path {
	case "", "/":
		handleStats(w, r)
	case "/top-langs":
		handleTopLangs(w, r)
	case "/pin":
		handlePin(w, r)
	case "/gist":
		handleGist(w, r)
	case "/wakatime":
		handleWakatime(w, r)
	case "/status/up":
		handleStatusUp(w, r)
	case "/status/pat-info":
		handlePATInfo(w, r)
	default:
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
	}
}

func writeHomePage(w http.ResponseWriter, r *http.Request) {
	baseURL := "https://" + r.Host
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		baseURL = proto + "://" + r.Host
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=0, must-revalidate")
	_, _ = fmt.Fprintf(w, `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GitHub Readme Stats · EdgeOne</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>
    body{margin:0;background:#f7f8fb;color:#172033;font-family:Inter,"Segoe UI","PingFang SC",system-ui,sans-serif}
    main{width:min(1040px,calc(100%% - 32px));margin:0 auto;padding:42px 0}
    header{border-bottom:1px solid #d9dee8;padding-bottom:24px}
    h1{margin:0;font-size:clamp(30px,5vw,48px);line-height:1.08}
    p{color:#667085;line-height:1.7}
    .grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.9fr);gap:24px;margin-top:26px}
    section,aside{background:#fff;border:1px solid #d9dee8;border-radius:8px;padding:22px}
    a.endpoint{display:grid;grid-template-columns:auto 1fr;gap:12px;margin-top:10px;padding:12px;border:1px solid #d9dee8;border-radius:8px;color:inherit;text-decoration:none}
    .method{align-self:start;border-radius:6px;background:#e8f2ff;color:#1677ff;padding:5px 8px;font-size:12px;font-weight:800}
    code,.path{font-family:"SFMono-Regular",Consolas,monospace}
    .hint{display:block;margin-top:4px;color:#667085;font-size:12px;overflow-wrap:anywhere}
    img{display:block;width:100%%;max-width:495px;height:auto;margin-top:12px}
    footer{margin-top:24px;color:#667085}
    @media(max-width:820px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>GitHub Readme Stats · EdgeOne</h1>
      <p>EdgeOne Pages Go Cloud Functions 版本，兼容常用 github-readme-stats 图片接口。</p>
    </header>
    <div class="grid">
      <section>
        <h2>可用接口</h2>
        <a class="endpoint" href="%[1]s/api?username=Mintimate&show_icons=true" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api</span><span class="hint">GitHub 统计卡</span></span></a>
        <a class="endpoint" href="%[1]s/api/top-langs?username=Mintimate&layout=compact" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/top-langs</span><span class="hint">语言占比卡</span></span></a>
        <a class="endpoint" href="%[1]s/api/pin?username=Mintimate&repo=github-readme-stats-eo" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/pin</span><span class="hint">仓库卡片</span></span></a>
        <a class="endpoint" href="%[1]s/api/gist?id=bbfce31e0217a3689c8d961a356cb10d" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/gist</span><span class="hint">Gist 卡片</span></span></a>
        <a class="endpoint" href="%[1]s/api/wakatime?username=ffflabs&layout=compact" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/wakatime</span><span class="hint">WakaTime 统计</span></span></a>
      </section>
      <aside>
        <h2>快速预览</h2>
        <img src="%[1]s/api?username=Mintimate&show_icons=true" alt="GitHub stats preview">
        <img src="%[1]s/api/top-langs?username=Mintimate&layout=compact" alt="Top languages preview">
        <p><code>![GitHub Stats](%[1]s/api?username=Mintimate&show_icons=true)</code></p>
      </aside>
    </div>
    <footer>Powered by EdgeOne Pages · <a href="https://github.com/Mintimate/github-readme-stats-eo" target="_blank" rel="noreferrer">GitHub</a></footer>
  </main>
</body>
</html>`, html.EscapeString(baseURL))
}


func normalizeAPIPath(path string) string {
	if strings.HasPrefix(path, "/api") {
		path = strings.TrimPrefix(path, "/api")
	}
	if path == "" {
		return "/"
	}
	path = strings.TrimRight(path, "/")
	if path == "" {
		return "/"
	}
	return path
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	if username == "" {
		writeSVGError(w, "Missing username", "Use /api?username=USERNAME")
		return
	}

	client := newGitHubClient()
	data, err := client.fetchStats(r.Context(), username, parseBool(q.Get("include_all_commits")), parseCSV(q.Get("exclude_repo")), parseBool(q.Get("show_prs_merged")) || strings.Contains(q.Get("show"), "prs_merged"), strings.Contains(q.Get("show"), "discussions_started"), strings.Contains(q.Get("show"), "discussions_answered"), q.Get("commits_year"))
	if err != nil {
		writeSVGError(w, err.Error(), "GitHub API request failed")
		return
	}

	cacheSeconds := resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["stats"])
	writeSVG(w, cacheSeconds, renderStatsCard(data, cardOptionsFromQuery(q)))
}

func handleTopLangs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	if username == "" {
		writeSVGError(w, "Missing username", "Use /api/top-langs?username=USERNAME")
		return
	}

	client := newGitHubClient()
	langs, err := client.fetchTopLanguages(r.Context(), username, parseCSV(q.Get("exclude_repo")), parseFloatDefault(q.Get("size_weight"), 1), parseFloatDefault(q.Get("count_weight"), 0))
	if err != nil {
		writeSVGError(w, err.Error(), "GitHub API request failed")
		return
	}

	cacheSeconds := resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["topLangs"])
	writeSVG(w, cacheSeconds, renderTopLangsCard(langs, cardOptionsFromQuery(q), parseIntDefault(q.Get("langs_count"), 5), parseCSV(q.Get("hide"))))
}

func handlePin(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	repo := q.Get("repo")
	if username == "" || repo == "" {
		writeSVGError(w, "Missing username or repo", "Use /api/pin?username=USERNAME&repo=REPO")
		return
	}

	client := newGitHubClient()
	data, err := client.fetchRepo(r.Context(), username, repo)
	if err != nil {
		writeSVGError(w, err.Error(), "GitHub API request failed")
		return
	}

	cacheSeconds := resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["pin"])
	writeSVG(w, cacheSeconds, renderRepoCard(data, cardOptionsFromQuery(q), parseBool(q.Get("show_owner"))))
}

func handleGist(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	id := q.Get("id")
	if id == "" {
		writeSVGError(w, "Missing gist id", "Use /api/gist?id=GIST_ID")
		return
	}

	client := newGitHubClient()
	data, err := client.fetchGist(r.Context(), id)
	if err != nil {
		writeSVGError(w, err.Error(), "GitHub API request failed")
		return
	}

	cacheSeconds := resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["gist"])
	writeSVG(w, cacheSeconds, renderGistCard(data, cardOptionsFromQuery(q), parseBool(q.Get("show_owner"))))
}

func handleWakatime(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	if username == "" {
		writeSVGError(w, "Missing username", "Use /api/wakatime?username=USERNAME")
		return
	}

	data, err := fetchWakatime(r.Context(), username, q.Get("api_domain"))
	if err != nil {
		writeSVGError(w, err.Error(), "WakaTime API request failed")
		return
	}

	cacheSeconds := resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["wakatime"])
	writeSVG(w, cacheSeconds, renderWakatimeCard(data, cardOptionsFromQuery(q), parseIntDefault(q.Get("langs_count"), 5), parseCSV(q.Get("hide"))))
}

func handleStatusUp(w http.ResponseWriter, r *http.Request) {
	client := newGitHubClient()
	up := client.hasUsableToken(r.Context())
	if up {
		w.Header().Set("Cache-Control", "max-age=0, s-maxage=300")
	} else {
		w.Header().Set("Cache-Control", "no-store")
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	switch strings.ToLower(r.URL.Query().Get("type")) {
	case "shields":
		color := "red"
		message := "down"
		if up {
			color = "brightgreen"
			message = "up"
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"schemaVersion": 1,
			"label":         "Public Instance",
			"message":       message,
			"color":         color,
			"isError":       true,
		})
	case "json":
		_ = json.NewEncoder(w).Encode(map[string]bool{"up": up})
	default:
		_, _ = w.Write([]byte(strconv.FormatBool(up)))
	}
}

func handlePATInfo(w http.ResponseWriter, r *http.Request) {
	client := newGitHubClient()
	info := client.patInfo(r.Context())
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "max-age=0, s-maxage=300")
	_ = json.NewEncoder(w).Encode(info)
}

func newGitHubClient() *gitHubClient {
	keys := make([]string, 0)
	for _, env := range os.Environ() {
		key, value, ok := strings.Cut(env, "=")
		if !ok || value == "" {
			continue
		}
		if regexp.MustCompile(`^PAT_\d+$`).MatchString(key) {
			keys = append(keys, key)
		}
	}
	sort.Slice(keys, func(i, j int) bool { return naturalPATLess(keys[i], keys[j]) })

	tokens := make([]string, 0, len(keys))
	for _, key := range keys {
		tokens = append(tokens, os.Getenv(key))
	}

	return &gitHubClient{
		httpClient: &http.Client{Timeout: 12 * time.Second},
		tokens:     tokens,
	}
}

func naturalPATLess(a, b string) bool {
	an, _ := strconv.Atoi(strings.TrimPrefix(a, "PAT_"))
	bn, _ := strconv.Atoi(strings.TrimPrefix(b, "PAT_"))
	return an < bn
}

func (c *gitHubClient) graphQL(ctx context.Context, query string, variables map[string]any, target any) error {
	if len(c.tokens) == 0 {
		return errors.New("no GitHub API tokens found")
	}

	var lastErr error
	for _, token := range c.tokens {
		body, _ := json.Marshal(map[string]any{"query": query, "variables": variables})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, githubGraphQLEndpoint, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "bearer "+token)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		payload, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}
		if resp.StatusCode == http.StatusUnauthorized || bytes.Contains(bytes.ToLower(payload), []byte("bad credentials")) {
			lastErr = errors.New("bad GitHub credentials")
			continue
		}

		var gql graphQLResponse
		if err := json.Unmarshal(payload, &gql); err != nil {
			return err
		}
		if len(gql.Errors) > 0 {
			if isRateLimited(gql.Errors) {
				lastErr = errors.New("GitHub API rate limited")
				continue
			}
			if hasGraphQLData(gql.Data) {
				if err := json.Unmarshal(gql.Data, target); err == nil {
					return nil
				}
			}
			return fmt.Errorf("%s", gql.Errors[0].Message)
		}
		return json.Unmarshal(gql.Data, target)
	}

	if lastErr != nil {
		return lastErr
	}
	return errors.New("GitHub API request failed")
}

func (c *gitHubClient) restJSON(ctx context.Context, path string, target any) error {
	if len(c.tokens) == 0 {
		return errors.New("no GitHub API tokens found")
	}

	var lastErr error
	for _, token := range c.tokens {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubRESTEndpoint+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Accept", "application/vnd.github.cloak-preview+json")
		req.Header.Set("Authorization", "token "+token)
		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		payload, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}
		if resp.StatusCode == http.StatusUnauthorized {
			lastErr = errors.New("bad GitHub credentials")
			continue
		}
		if resp.StatusCode == http.StatusForbidden && bytes.Contains(bytes.ToLower(payload), []byte("rate limit")) {
			lastErr = errors.New("GitHub API rate limited")
			continue
		}
		if resp.StatusCode >= 400 {
			return fmt.Errorf("GitHub REST API returned %s", resp.Status)
		}
		return json.Unmarshal(payload, target)
	}

	return lastErr
}

func isRateLimited(errors []graphQLError) bool {
	for _, err := range errors {
		if strings.EqualFold(err.Type, "RATE_LIMITED") || strings.Contains(strings.ToLower(err.Message), "rate limit") {
			return true
		}
	}
	return false
}

func hasGraphQLData(data json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(data))
	return trimmed != "" && trimmed != "null" && trimmed != "{}"
}

func (c *gitHubClient) hasUsableToken(ctx context.Context) bool {
	var data struct {
		RateLimit struct {
			Remaining int `json:"remaining"`
		} `json:"rateLimit"`
	}
	err := c.graphQL(ctx, `query { rateLimit { remaining } }`, map[string]any{}, &data)
	return err == nil
}

func (c *gitHubClient) patInfo(ctx context.Context) map[string]any {
	result := map[string]any{
		"validPATs":     []string{},
		"expiredPATs":   []string{},
		"exhaustedPATs": []string{},
		"errorPATs":     []string{},
		"details":       map[string]any{},
	}

	keys := make([]string, 0)
	for _, env := range os.Environ() {
		key, _, ok := strings.Cut(env, "=")
		if ok && regexp.MustCompile(`^PAT_\d+$`).MatchString(key) {
			keys = append(keys, key)
		}
	}
	sort.Slice(keys, func(i, j int) bool { return naturalPATLess(keys[i], keys[j]) })

	details := map[string]any{}
	for _, key := range keys {
		status := c.singlePATStatus(ctx, os.Getenv(key))
		details[key] = status
		statusName, _ := status["status"].(string)
		switch statusName {
		case "valid":
			result["validPATs"] = append(result["validPATs"].([]string), key)
		case "expired":
			result["expiredPATs"] = append(result["expiredPATs"].([]string), key)
		case "exhausted":
			result["exhaustedPATs"] = append(result["exhaustedPATs"].([]string), key)
		default:
			result["errorPATs"] = append(result["errorPATs"].([]string), key)
		}
	}
	result["details"] = details
	return result
}

func (c *gitHubClient) singlePATStatus(ctx context.Context, token string) map[string]any {
	body, _ := json.Marshal(map[string]any{"query": `query { rateLimit { remaining resetAt } }`, "variables": map[string]any{}})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, githubGraphQLEndpoint, bytes.NewReader(body))
	if err != nil {
		return map[string]any{"status": "error", "message": err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "bearer "+token)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return map[string]any{"status": "error", "message": err.Error()}
	}
	payload, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return map[string]any{"status": "expired"}
	}

	var parsed struct {
		Data struct {
			RateLimit struct {
				Remaining int    `json:"remaining"`
				ResetAt   string `json:"resetAt"`
			} `json:"rateLimit"`
		} `json:"data"`
		Errors []graphQLError `json:"errors"`
	}
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return map[string]any{"status": "error", "message": err.Error()}
	}
	if len(parsed.Errors) > 0 {
		if isRateLimited(parsed.Errors) {
			return map[string]any{"status": "exhausted", "remaining": 0, "resetAt": parsed.Data.RateLimit.ResetAt}
		}
		return map[string]any{"status": "error", "message": parsed.Errors[0].Message, "type": parsed.Errors[0].Type}
	}
	if parsed.Data.RateLimit.Remaining == 0 {
		return map[string]any{"status": "exhausted", "remaining": 0, "resetAt": parsed.Data.RateLimit.ResetAt}
	}
	return map[string]any{"status": "valid", "remaining": parsed.Data.RateLimit.Remaining}
}

func (c *gitHubClient) fetchStats(ctx context.Context, username string, includeAllCommits bool, excludeRepos []string, includeMergedPRs bool, includeDiscussions bool, includeDiscussionAnswers bool, commitsYear string) (statsData, error) {
	variables := map[string]any{
		"login":                     username,
		"includeMergedPullRequests": includeMergedPRs,
		"includeDiscussions":        includeDiscussions,
		"includeDiscussionsAnswers": includeDiscussionAnswers,
	}
	if commitsYear != "" {
		variables["startTime"] = commitsYear + "-01-01T00:00:00Z"
	}

	query := `
query userInfo($login: String!, $includeMergedPullRequests: Boolean!, $includeDiscussions: Boolean!, $includeDiscussionsAnswers: Boolean!, $startTime: DateTime = null) {
  user(login: $login) {
    name
    login
    followers { totalCount }
    commits: contributionsCollection(from: $startTime) { totalCommitContributions }
    reviews: contributionsCollection { totalPullRequestReviewContributions }
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) { totalCount }
    pullRequests(first: 1) { totalCount }
    mergedPullRequests: pullRequests(states: MERGED) @include(if: $includeMergedPullRequests) { totalCount }
    openIssues: issues(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    repositoryDiscussions @include(if: $includeDiscussions) { totalCount }
    repositoryDiscussionComments(onlyAnswers: true) @include(if: $includeDiscussionsAnswers) { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {direction: DESC, field: STARGAZERS}) {
      totalCount
      nodes { name stargazers { totalCount } }
    }
  }
}`

	var response struct {
		User struct {
			Name      string `json:"name"`
			Login     string `json:"login"`
			Followers count  `json:"followers"`
			Commits   struct {
				TotalCommitContributions int `json:"totalCommitContributions"`
			} `json:"commits"`
			Reviews struct {
				TotalPullRequestReviewContributions int `json:"totalPullRequestReviewContributions"`
			} `json:"reviews"`
			RepositoriesContributedTo    count `json:"repositoriesContributedTo"`
			PullRequests                 count `json:"pullRequests"`
			MergedPullRequests           count `json:"mergedPullRequests"`
			OpenIssues                   count `json:"openIssues"`
			ClosedIssues                 count `json:"closedIssues"`
			RepositoryDiscussions        count `json:"repositoryDiscussions"`
			RepositoryDiscussionComments count `json:"repositoryDiscussionComments"`
			Repositories                 struct {
				TotalCount int `json:"totalCount"`
				Nodes      []struct {
					Name       string `json:"name"`
					Stargazers count  `json:"stargazers"`
				} `json:"nodes"`
			} `json:"repositories"`
		} `json:"user"`
	}

	if err := c.graphQL(ctx, query, variables, &response); err != nil {
		return statsData{}, err
	}
	if response.User.Login == "" {
		return statsData{}, errors.New("user not found")
	}

	totalCommits := response.User.Commits.TotalCommitContributions
	if includeAllCommits {
		var rest struct {
			TotalCount int `json:"total_count"`
		}
		if err := c.restJSON(ctx, "/search/commits?q=author:"+username, &rest); err == nil && rest.TotalCount > 0 {
			totalCommits = rest.TotalCount
		}
	}

	excluded := setFromStrings(append(excludeRepos, parseCSV(os.Getenv("EXCLUDE_REPO"))...))
	totalStars := 0
	for _, repo := range response.User.Repositories.Nodes {
		if !excluded[repo.Name] {
			totalStars += repo.Stargazers.TotalCount
		}
	}

	name := response.User.Name
	if name == "" {
		name = response.User.Login
	}
	mergedPercent := 0.0
	if response.User.PullRequests.TotalCount > 0 {
		mergedPercent = float64(response.User.MergedPullRequests.TotalCount) / float64(response.User.PullRequests.TotalCount) * 100
	}
	level, percentile := calculateRank(includeAllCommits, totalCommits, response.User.PullRequests.TotalCount, response.User.OpenIssues.TotalCount+response.User.ClosedIssues.TotalCount, response.User.Reviews.TotalPullRequestReviewContributions, totalStars, response.User.Followers.TotalCount)

	return statsData{
		Name:                     name,
		TotalCommits:             totalCommits,
		TotalPRs:                 response.User.PullRequests.TotalCount,
		TotalPRsMerged:           response.User.MergedPullRequests.TotalCount,
		MergedPRsPercentage:      mergedPercent,
		TotalReviews:             response.User.Reviews.TotalPullRequestReviewContributions,
		TotalIssues:              response.User.OpenIssues.TotalCount + response.User.ClosedIssues.TotalCount,
		TotalStars:               totalStars,
		TotalDiscussionsStarted:  response.User.RepositoryDiscussions.TotalCount,
		TotalDiscussionsAnswered: response.User.RepositoryDiscussionComments.TotalCount,
		ContributedTo:            response.User.RepositoriesContributedTo.TotalCount,
		Followers:                response.User.Followers.TotalCount,
		Repositories:             response.User.Repositories.TotalCount,
		RankLevel:                level,
		RankPercentile:           percentile,
	}, nil
}

type count struct {
	TotalCount int `json:"totalCount"`
}

func (c *gitHubClient) fetchRepo(ctx context.Context, username string, repo string) (repoData, error) {
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
		return repoData{}, err
	}
	source := response.Repository
	if source.Name == "" || source.IsPrivate {
		return repoData{}, errors.New("repository not found")
	}
	return repoData{
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

func (c *gitHubClient) fetchGist(ctx context.Context, id string) (gistData, error) {
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
		return gistData{}, err
	}
	if len(response.Viewer.Gist.Files) == 0 {
		return gistData{}, errors.New("gist not found")
	}
	first := response.Viewer.Gist.Files[0]
	primaryLanguage := calculatePrimaryGistLanguage(response.Viewer.Gist.Files)
	return gistData{
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

func fetchWakatime(ctx context.Context, username string, apiDomain string) ([]wakatimeLanguage, error) {
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
			Languages []wakatimeLanguage `json:"languages"`
		} `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload.Data.Languages, nil
}

func (c *gitHubClient) fetchTopLanguages(ctx context.Context, username string, excludeRepos []string, sizeWeight float64, countWeight float64) ([]languageStat, error) {
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
	stats := map[string]*languageStat{}
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
				stat = &languageStat{Name: edge.Node.Name, Color: defaultColor(edge.Node.Color, colorForName(edge.Node.Name))}
				stats[edge.Node.Name] = stat
			}
			stat.Size += edge.Size
			if !seenInRepo[edge.Node.Name] {
				stat.Count++
				seenInRepo[edge.Node.Name] = true
			}
		}
	}

	result := make([]languageStat, 0, len(stats))
	for _, stat := range stats {
		score := math.Pow(stat.Size, sizeWeight) * math.Pow(float64(max(1, stat.Count)), countWeight)
		result = append(result, languageStat{Name: stat.Name, Color: stat.Color, Size: score, Count: stat.Count})
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

type cardOptions struct {
	TitleColor      string
	TextColor       string
	IconColor       string
	BgColor         string
	BorderColor     string
	RingColor       string
	HideBorder      bool
	HideTitle       bool
	ShowIcons       bool
	TextBold        bool
	HideProgress    bool
	DisableAnim     bool
	CustomTitle     string
	Theme           string
	ThemeProvided   bool
	RankIcon        string
	Layout          string
	StatsFormat     string
	DisplayFormat   string
	NumberFormat    string
	NumberPrecision int
	CardWidth       int
	LineHeight      int
	BorderRadius    float64
	HideStats       []string
	ShowStats       []string
}

type themeColors struct {
	Title  string
	Icon   string
	Text   string
	Bg     string
	Border string
	Ring   string
}

var builtinThemes = map[string]themeColors{
	"default": {Title: "2f80ed", Icon: "4c71f2", Text: "434d58", Bg: "fffefe", Border: "e4e2e2"},
	"default_repocard": {Title: "2f80ed", Icon: "586069", Text: "434d58", Bg: "fffefe", Border: ""},
	"transparent": {Title: "006AFF", Icon: "0579C3", Text: "417E87", Bg: "ffffff00", Border: ""},
	"shadow_red": {Title: "9A0000", Icon: "4F0000", Text: "444", Bg: "ffffff00", Border: "4F0000"},
	"shadow_green": {Title: "007A00", Icon: "003D00", Text: "444", Bg: "ffffff00", Border: "003D00"},
	"shadow_blue": {Title: "00779A", Icon: "004450", Text: "444", Bg: "ffffff00", Border: "004490"},
	"dark": {Title: "fff", Icon: "79ff97", Text: "9f9f9f", Bg: "151515", Border: ""},
	"radical": {Title: "fe428e", Icon: "f8d847", Text: "a9fef7", Bg: "141321", Border: ""},
	"merko": {Title: "abd200", Icon: "b7d364", Text: "68b587", Bg: "0a0f0b", Border: ""},
	"gruvbox": {Title: "fabd2f", Icon: "fe8019", Text: "8ec07c", Bg: "282828", Border: ""},
	"gruvbox_light": {Title: "b57614", Icon: "af3a03", Text: "427b58", Bg: "fbf1c7", Border: ""},
	"tokyonight": {Title: "70a5fd", Icon: "bf91f3", Text: "38bdae", Bg: "1a1b27", Border: ""},
	"onedark": {Title: "e4bf7a", Icon: "8eb573", Text: "df6d74", Bg: "282c34", Border: ""},
	"cobalt": {Title: "e683d9", Icon: "0480ef", Text: "75eeb2", Bg: "193549", Border: ""},
	"synthwave": {Title: "e2e9ec", Icon: "ef8539", Text: "e5289e", Bg: "2b213a", Border: ""},
	"highcontrast": {Title: "e7f216", Icon: "00ffff", Text: "fff", Bg: "000", Border: ""},
	"dracula": {Title: "ff6e96", Icon: "79dafa", Text: "f8f8f2", Bg: "282a36", Border: ""},
	"prussian": {Title: "bddfff", Icon: "38a0ff", Text: "6e93b5", Bg: "172f45", Border: ""},
	"monokai": {Title: "eb1f6a", Icon: "e28905", Text: "f1f1eb", Bg: "272822", Border: ""},
	"vue": {Title: "41b883", Icon: "41b883", Text: "273849", Bg: "fffefe", Border: ""},
	"vue-dark": {Title: "41b883", Icon: "41b883", Text: "fffefe", Bg: "273849", Border: ""},
	"shades-of-purple": {Title: "fad000", Icon: "b362ff", Text: "a599e9", Bg: "2d2b55", Border: ""},
	"nightowl": {Title: "c792ea", Icon: "ffeb95", Text: "7fdbca", Bg: "011627", Border: ""},
	"buefy": {Title: "7957d5", Icon: "ff3860", Text: "363636", Bg: "ffffff", Border: ""},
	"blue-green": {Title: "2f97c1", Icon: "f5b700", Text: "0cf574", Bg: "040f0f", Border: ""},
	"algolia": {Title: "00AEFF", Icon: "2DDE98", Text: "FFFFFF", Bg: "050F2C", Border: ""},
	"great-gatsby": {Title: "ffa726", Icon: "ffb74d", Text: "ffd95b", Bg: "000000", Border: ""},
	"darcula": {Title: "BA5F17", Icon: "84628F", Text: "BEBEBE", Bg: "242424", Border: ""},
	"bear": {Title: "e03c8a", Icon: "00AEFF", Text: "bcb28d", Bg: "1f2023", Border: ""},
	"solarized-dark": {Title: "268bd2", Icon: "b58900", Text: "859900", Bg: "002b36", Border: ""},
	"solarized-light": {Title: "268bd2", Icon: "b58900", Text: "859900", Bg: "fdf6e3", Border: ""},
	"chartreuse-dark": {Title: "7fff00", Icon: "00AEFF", Text: "fff", Bg: "000", Border: ""},
	"nord": {Title: "81a1c1", Icon: "88c0d0", Text: "d8dee9", Bg: "2e3440", Border: ""},
	"gotham": {Title: "2aa889", Icon: "599cab", Text: "99d1ce", Bg: "0c1014", Border: ""},
	"material-palenight": {Title: "c792ea", Icon: "89ddff", Text: "a6accd", Bg: "292d3e", Border: ""},
	"graywhite": {Title: "24292e", Icon: "24292e", Text: "24292e", Bg: "ffffff", Border: ""},
	"vision-friendly-dark": {Title: "ffb000", Icon: "785ef0", Text: "ffffff", Bg: "000000", Border: ""},
	"ayu-mirage": {Title: "f4cd7c", Icon: "73d0ff", Text: "c7c8c2", Bg: "1f2430", Border: ""},
	"midnight-purple": {Title: "9745f5", Icon: "9f4bff", Text: "ffffff", Bg: "000000", Border: ""},
	"calm": {Title: "e07a5f", Icon: "edae49", Text: "ebcfb2", Bg: "373f51", Border: ""},
	"flag-india": {Title: "ff8f1c", Icon: "250E62", Text: "509E2F", Bg: "ffffff", Border: ""},
	"omni": {Title: "FF79C6", Icon: "e7de79", Text: "E1E1E6", Bg: "191622", Border: ""},
	"react": {Title: "61dafb", Icon: "61dafb", Text: "ffffff", Bg: "20232a", Border: ""},
	"jolly": {Title: "ff64da", Icon: "a960ff", Text: "ffffff", Bg: "291B3E", Border: ""},
	"maroongold": {Title: "F7EF8A", Icon: "F7EF8A", Text: "E0AA3E", Bg: "260000", Border: ""},
	"yeblu": {Title: "ffff00", Icon: "ffff00", Text: "ffffff", Bg: "002046", Border: ""},
	"blueberry": {Title: "82aaff", Icon: "89ddff", Text: "27e8a7", Bg: "242938", Border: ""},
	"slateorange": {Title: "faa627", Icon: "faa627", Text: "ffffff", Bg: "36393f", Border: ""},
	"kacho_ga": {Title: "bf4a3f", Icon: "a64833", Text: "d9c8a9", Bg: "402b23", Border: ""},
	"outrun": {Title: "ffcc00", Icon: "ff1aff", Text: "8080ff", Bg: "141439", Border: ""},
	"ocean_dark": {Title: "8957B2", Icon: "FFFFFF", Text: "92D534", Bg: "151A28", Border: ""},
	"city_lights": {Title: "5D8CB3", Icon: "4798FF", Text: "718CA1", Bg: "1D252C", Border: ""},
	"github_dark": {Title: "58A6FF", Icon: "1F6FEB", Text: "C3D1D9", Bg: "0D1117", Border: ""},
	"github_dark_dimmed": {Title: "539bf5", Icon: "539bf5", Text: "ADBAC7", Bg: "24292F", Border: "373E47"},
	"discord_old_blurple": {Title: "7289DA", Icon: "7289DA", Text: "FFFFFF", Bg: "2C2F33", Border: ""},
	"aura_dark": {Title: "ff7372", Icon: "6cffd0", Text: "dbdbdb", Bg: "252334", Border: ""},
	"panda": {Title: "19f9d899", Icon: "19f9d899", Text: "FF75B5", Bg: "31353a", Border: ""},
	"noctis_minimus": {Title: "d3b692", Icon: "72b7c0", Text: "c5cdd3", Bg: "1b2932", Border: ""},
	"cobalt2": {Title: "ffc600", Icon: "ffffff", Text: "0088ff", Bg: "193549", Border: ""},
	"swift": {Title: "000000", Icon: "f05237", Text: "000000", Bg: "f7f7f7", Border: ""},
	"aura": {Title: "a277ff", Icon: "ffca85", Text: "61ffca", Bg: "15141b", Border: ""},
	"apprentice": {Title: "ffffff", Icon: "ffffaf", Text: "bcbcbc", Bg: "262626", Border: ""},
	"moltack": {Title: "86092C", Icon: "86092C", Text: "574038", Bg: "F5E1C0", Border: ""},
	"codeSTACKr": {Title: "ff652f", Icon: "FFE400", Text: "ffffff", Bg: "09131B", Border: "0c1a25"},
	"rose_pine": {Title: "9ccfd8", Icon: "ebbcba", Text: "e0def4", Bg: "191724", Border: ""},
	"catppuccin_latte": {Title: "137980", Icon: "8839ef", Text: "4c4f69", Bg: "eff1f5", Border: ""},
	"catppuccin_mocha": {Title: "94e2d5", Icon: "cba6f7", Text: "cdd6f4", Bg: "1e1e2e", Border: ""},
	"date_night": {Title: "DA7885", Icon: "BB8470", Text: "E1B2A2", Bg: "170F0C", Border: "170F0C"},
	"one_dark_pro": {Title: "61AFEF", Icon: "C678DD", Text: "E5C06E", Bg: "23272E", Border: "3B4048"},
	"rose": {Title: "8d192b", Icon: "B71F36", Text: "862931", Bg: "e9d8d4", Border: "e9d8d4"},
	"holi": {Title: "5FABEE", Icon: "5FABEE", Text: "D6E7FF", Bg: "030314", Border: "85A4C0"},
	"neon": {Title: "00EAD3", Icon: "00EAD3", Text: "FF449F", Bg: "000000", Border: "ffffff"},
	"blue_navy": {Title: "82AAFF", Icon: "82AAFF", Text: "82AAFF", Bg: "000000", Border: "ffffff"},
	"calm_pink": {Title: "e07a5f", Icon: "ebcfb2", Text: "edae49", Bg: "2b2d40", Border: "e1bc29"},
	"ambient_gradient": {Title: "ffffff", Icon: "ffffff", Text: "ffffff", Bg: "35,4158d0,c850c0,ffcc70", Border: ""},
}

func cardOptionsFromQuery(q map[string][]string) cardOptions {
	get := func(key string) string {
		if values := q[key]; len(values) > 0 {
			return values[0]
		}
		return ""
	}
	themeName := get("theme")
	if themeName == "" {
		themeName = "default"
	}
	theme, ok := builtinThemes[themeName]
	if !ok {
		themeName = "default"
		theme = builtinThemes["default"]
	}
	border := theme.Border
	if border == "" {
		border = builtinThemes["default"].Border
	}
	ring := theme.Ring
	if ring == "" {
		ring = theme.Title
	}
	return cardOptions{
		TitleColor:      normalizeColor(get("title_color"), "#"+theme.Title),
		TextColor:       normalizeColor(get("text_color"), "#"+theme.Text),
		IconColor:       normalizeColor(get("icon_color"), "#"+theme.Icon),
		BgColor:         normalizeBgColor(get("bg_color"), "#"+theme.Bg),
		BorderColor:     normalizeColor(get("border_color"), "#"+border),
		RingColor:       normalizeColor(get("ring_color"), "#"+ring),
		HideBorder:      parseBool(get("hide_border")),
		HideTitle:       parseBool(get("hide_title")),
		ShowIcons:       parseBool(get("show_icons")),
		TextBold:        get("text_bold") == "" || parseBool(get("text_bold")),
		HideProgress:    parseBool(get("hide_progress")),
		DisableAnim:     parseBool(get("disable_animations")),
		CustomTitle:     get("custom_title"),
		Theme:           themeName,
		ThemeProvided:   get("theme") != "",
		RankIcon:        defaultString(get("rank_icon"), "default"),
		Layout:          defaultString(get("layout"), "normal"),
		StatsFormat:     defaultString(get("stats_format"), "percentages"),
		DisplayFormat:   defaultString(get("display_format"), "percent"),
		NumberFormat:    defaultString(get("number_format"), "short"),
		NumberPrecision: parseIntDefault(get("number_precision"), 1),
		CardWidth:       parseIntDefault(get("card_width"), 0),
		LineHeight:      parseIntDefault(get("line_height"), 25),
		BorderRadius:    parseFloatDefault(get("border_radius"), 4.5),
		HideStats:       parseCSV(get("hide")),
		ShowStats:       parseCSV(get("show")),
	}
}

func renderStatsCard(data statsData, opts cardOptions) string {
	title := opts.CustomTitle
	if title == "" {
		title = data.Name + "'s GitHub Stats"
	}
	width := opts.CardWidth
	if width < 287 {
		width = 495
	}
	lineHeight := opts.LineHeight
	if lineHeight < 18 {
		lineHeight = 25
	}
	stats := []struct {
		key   string
		label string
		value string
		icon  string
	}{
		{"stars", "Total Stars Earned", formatNumberWithOptions(data.TotalStars, opts), svgIconStar},
		{"commits", "Total Commits", formatNumberWithOptions(data.TotalCommits, opts), svgIconCommits},
		{"prs", "Total PRs", formatNumberWithOptions(data.TotalPRs, opts), svgIconPRs},
		{"issues", "Total Issues", formatNumberWithOptions(data.TotalIssues, opts), svgIconIssues},
		{"contribs", "Contributed to (last year)", formatNumberWithOptions(data.ContributedTo, opts), svgIconContribs},
	}
	showSet := setFromStrings(opts.ShowStats)
	if showSet["prs_merged"] {
		stats = append(stats, struct {
			key   string
			label string
			value string
			icon  string
		}{"prs_merged", "Merged PRs", formatNumberWithOptions(data.TotalPRsMerged, opts), svgIconPRs})
	}
	if showSet["prs_merged_percentage"] {
		stats = append(stats, struct {
			key   string
			label string
			value string
			icon  string
		}{"prs_merged_percentage", "Merged PRs Percentage", fmt.Sprintf("%.1f%%", data.MergedPRsPercentage), svgIconPRs})
	}
	if showSet["discussions_started"] {
		stats = append(stats, struct {
			key   string
			label string
			value string
			icon  string
		}{"discussions_started", "Discussions Started", formatNumberWithOptions(data.TotalDiscussionsStarted, opts), svgIconIssues})
	}
	if showSet["discussions_answered"] {
		stats = append(stats, struct {
			key   string
			label string
			value string
			icon  string
		}{"discussions_answered", "Discussions Answered", formatNumberWithOptions(data.TotalDiscussionsAnswered, opts), svgIconIssues})
	}
	hideSet := setFromStrings(opts.HideStats)
	rows := make([]string, 0, len(stats))
	for _, stat := range stats {
		if hideSet[stat.key] || hideSet[strings.ToLower(stat.label)] {
			continue
		}
		rows = append(rows, statRow(stat.label, stat.value, stat.icon, 58+len(rows)*lineHeight, opts))
	}
	rankX := width - 95
	rank := renderRank(opts, data.RankLevel, data.RankPercentile, rankX, 96)
	height := max(150, 55+len(rows)*lineHeight+35)
	return cardSVG(width, height, opts, title, strings.Join(rows, ""), rank)
}

func statRow(label string, value string, icon string, y int, opts cardOptions) string {
	iconPart := ""
	labelX := 25
	valueX := 230
	if opts.ShowIcons {
		iconPart = fmt.Sprintf(`<svg class="icon" x="0" y="-13" viewBox="0 0 16 16" width="16" height="16">%s</svg>`, icon)
		labelX = 27
		valueX = 250
	}
	weightClass := "bold"
	if !opts.TextBold {
		weightClass = "regular"
	}
	return fmt.Sprintf(`<g class="stagger" transform="translate(25,%d)">%s<text class="stat %s" x="%d" y="0">%s:</text><text class="stat %s" x="%d" y="0">%s</text></g>`, y, iconPart, weightClass, labelX, html.EscapeString(label), weightClass, valueX, html.EscapeString(value))
}

func renderRepoCard(data repoData, opts cardOptions, showOwner bool) string {
	title := data.Name
	if showOwner && data.NameWithOwner != "" {
		title = data.NameWithOwner
	}
	if !opts.ThemeProvided {
		opts = applyTheme(opts, "default_repocard")
	}
	descLines := wrapText(data.Description, 58, 3)
	if len(descLines) == 0 {
		descLines = []string{"No description provided"}
	}
	desc := renderTextLines(descLines, 25, 68, 18, "desc")
	langNode := ""
	if data.PrimaryLang != "" {
		langNode = fmt.Sprintf(`<circle cx="30" cy="142" r="6" fill="%s"/><text x="45" y="146" class="muted">%s</text>`, data.LanguageColor, html.EscapeString(data.PrimaryLang))
	}
	stats := fmt.Sprintf(`<g transform="translate(215,146)"><svg class="icon" x="0" y="-13" viewBox="0 0 16 16" width="16" height="16">%s</svg><text x="22" class="muted">%s</text></g><g transform="translate(305,146)"><svg class="icon" x="0" y="-13" viewBox="0 0 16 16" width="16" height="16">%s</svg><text x="22" class="muted">%s</text></g>`, svgIconStar, formatNumber(data.Stars), svgIconFork, formatNumber(data.Forks))
	body := desc + langNode + stats
	return cardSVG(400, 170, opts, title, body, "")
}

func renderGistCard(data gistData, opts cardOptions, showOwner bool) string {
	title := data.Name
	if showOwner && data.NameWithOwner != "" {
		title = data.NameWithOwner
	}
	descLines := wrapText(data.Description, 58, 3)
	if len(descLines) == 0 {
		descLines = []string{"No description provided"}
	}
	desc := renderTextLines(descLines, 25, 68, 18, "desc")
	langNode := ""
	if data.Language != "" {
		langNode = fmt.Sprintf(`<circle cx="30" cy="142" r="6" fill="%s"/><text x="45" y="146" class="muted">%s</text>`, colorForName(data.Language), html.EscapeString(data.Language))
	}
	stats := fmt.Sprintf(`<text x="215" y="146" class="muted">Stars %s</text><text x="305" y="146" class="muted">Forks %s</text>`, formatNumber(data.Stars), formatNumber(data.Forks))
	return cardSVG(400, 170, opts, title, desc+langNode+stats, "")
}

func applyTheme(opts cardOptions, name string) cardOptions {
	theme, ok := builtinThemes[name]
	if !ok {
		return opts
	}
	border := theme.Border
	if border == "" {
		border = builtinThemes["default"].Border
	}
	ring := theme.Ring
	if ring == "" {
		ring = theme.Title
	}
	opts.Theme = name
	opts.TitleColor = normalizeColor(theme.Title, opts.TitleColor)
	opts.TextColor = normalizeColor(theme.Text, opts.TextColor)
	opts.IconColor = normalizeColor(theme.Icon, opts.IconColor)
	opts.BgColor = normalizeBgColor(theme.Bg, opts.BgColor)
	opts.BorderColor = normalizeColor(border, opts.BorderColor)
	opts.RingColor = normalizeColor(ring, opts.RingColor)
	return opts
}

func renderTopLangsCard(langs []languageStat, opts cardOptions, count int, hide []string) string {
	if count <= 0 || count > 20 {
		if opts.Layout == "compact" || opts.Layout == "pie" || opts.Layout == "donut-vertical" {
			count = 6
		} else {
			count = 5
		}
	}
	filtered, total := filterLangs(langs, count, hide)
	title := opts.CustomTitle
	if title == "" {
		title = "Most Used Languages"
	}
	switch opts.Layout {
	case "compact":
		return renderCompactLangs(filtered, total, opts, title)
	case "donut", "donut-vertical", "pie":
		return renderDonutLangs(filtered, total, opts, title)
	default:
		return renderNormalLangs(filtered, total, opts, title)
	}
}

func renderNormalLangs(filtered []languageStat, total float64, opts cardOptions, title string) string {
	rows := strings.Builder{}
	for i, lang := range filtered {
		percent := percentOf(lang.Size, total)
		y := 55 + i*45
		barWidth := 300.0
		display := langDisplayValue(lang.Size, percent, opts.StatsFormat)
		progress := ""
		if !opts.HideProgress {
			progress = fmt.Sprintf(`<text x="305" y="32" class="muted">%s</text><rect x="0" y="24" width="300" height="8" rx="5" fill="#ddd" opacity=".35"/><rect x="0" y="24" width="%.1f" height="8" rx="5" fill="%s"/>`, html.EscapeString(display), barWidth*percent/100, lang.Color)
		}
		rows.WriteString(fmt.Sprintf(`<g transform="translate(25,%d)"><text class="lang-name" x="0" y="15">%s</text>%s</g>`, y, html.EscapeString(lang.Name), progress))
	}
	height := max(120, 60+len(filtered)*45+15)
	return cardSVG(495, height, opts, title, rows.String(), "")
}

func renderCompactLangs(filtered []languageStat, total float64, opts cardOptions, title string) string {
	width := opts.CardWidth
	if width < 300 {
		width = 350
	}
	rows := strings.Builder{}
	for i, lang := range filtered {
		percent := percentOf(lang.Size, total)
		col := i % 2
		row := i / 2
		x := 25 + col*150
		y := 65 + row*25
		label := lang.Name
		if !opts.HideProgress {
			label = fmt.Sprintf("%s %.2f%%", label, percent)
		}
		rows.WriteString(fmt.Sprintf(`<g transform="translate(%d,%d)"><circle cx="5" cy="6" r="5" fill="%s"/><text x="17" y="10" class="lang-name">%s</text></g>`, x, y, lang.Color, html.EscapeString(label)))
	}
	height := max(90, 90+((len(filtered)+1)/2)*25)
	return cardSVG(width, height, opts, title, rows.String(), "")
}

func renderDonutLangs(filtered []languageStat, total float64, opts cardOptions, title string) string {
	legend := strings.Builder{}
	width := 467
	cx, cy, r := 340.0, 125.0, 62.0
	isVertical := opts.Layout == "donut-vertical" || opts.Layout == "pie"
	if isVertical {
		width = 300
		cx, cy = 150.0, 110.0
	}
	chart := strings.Builder{}
	start := -90.0
	for i, lang := range filtered {
		percent := percentOf(lang.Size, total)
		if isVertical {
			col := i % 2
			row := i / 2
			x := 25 + col*135
			y := 190 + row*22
			legend.WriteString(fmt.Sprintf(`<g transform="translate(%d,%d)"><circle cx="5" cy="6" r="5" fill="%s"/><text x="17" y="10" class="lang-name">%s %.2f%%</text></g>`, x, y, lang.Color, html.EscapeString(lang.Name), percent))
		} else {
			y := 70 + i*32
			legend.WriteString(fmt.Sprintf(`<g transform="translate(25,%d)"><circle cx="5" cy="6" r="5" fill="%s"/><text x="22" y="11" class="lang-name">%s %.2f%%</text></g>`, y, lang.Color, html.EscapeString(lang.Name), percent))
		}
		if opts.Layout == "pie" {
			chart.WriteString(pieSlice(cx, cy, r, start, start+percent*3.6, lang.Color))
		} else {
			chart.WriteString(donutArc(cx, cy, r, start, start+percent*3.6, lang.Color))
		}
		start += percent * 3.6
	}
	if opts.Layout != "pie" {
		innerBg := opts.BgColor
		if strings.Contains(innerBg, ",") {
			innerBg = "url(#gradient)"
		}
		chart.WriteString(fmt.Sprintf(`<circle cx="%.1f" cy="%.1f" r="38" fill="%s"/>`, cx, cy, innerBg))
	}
	height := 245
	if isVertical {
		height = 315
	}
	return cardSVG(width, height, opts, title, legend.String()+chart.String(), "")
}

func renderWakatimeCard(langs []wakatimeLanguage, opts cardOptions, count int, hide []string) string {
	if count <= 0 || count > 10 {
		count = 5
	}
	hidden := setFromStrings(hide)
	filtered := make([]wakatimeLanguage, 0, len(langs))
	for _, lang := range langs {
		if hidden[strings.ToLower(lang.Name)] || hidden[lang.Name] {
			continue
		}
		filtered = append(filtered, lang)
		if len(filtered) == count {
			break
		}
	}
	title := opts.CustomTitle
	if title == "" {
		title = "WakaTime Stats"
	}
	rows := strings.Builder{}
	for i, lang := range filtered {
		y := 66 + i*34
		color := colorForName(lang.Name)
		label := fmt.Sprintf("%.1f%%", lang.Percent)
		if lang.Text != "" {
			label = lang.Text
		}
		barWidth := 180.0
		rows.WriteString(fmt.Sprintf(`<g transform="translate(25,%d)"><circle cx="0" cy="-4" r="5" fill="%s"/><text x="16" class="lang-name">%s</text><text x="185" class="muted">%s</text><rect x="0" y="10" width="270" height="8" rx="5" fill="#ddd" opacity=".35"/><rect x="0" y="10" width="%.1f" height="8" rx="5" fill="%s"/></g>`, y, color, html.EscapeString(lang.Name), html.EscapeString(label), barWidth*lang.Percent/100, color))
	}
	height := max(120, 75+len(filtered)*34)
	return cardSVG(495, height, opts, title, rows.String(), "")
}

func cardSVG(width int, height int, opts cardOptions, title string, body string, overlay string) string {
	stroke := opts.BorderColor
	if opts.HideBorder {
		stroke = "transparent"
	}
	titleNode := ""
	if !opts.HideTitle {
		titleNode = fmt.Sprintf(`<text x="25" y="35" class="title">%s</text>`, html.EscapeString(truncate(title, 48)))
	}
	bg := opts.BgColor
	defs := ""
	if strings.Contains(bg, ",") {
		parts := strings.Split(bg, ",")
		angle := parts[0]
		stops := strings.Builder{}
		for i, color := range parts[1:] {
			offset := 0
			if len(parts) > 2 {
				offset = int(float64(i) * 100 / float64(len(parts)-2))
			}
			stops.WriteString(fmt.Sprintf(`<stop offset="%d%%" stop-color="%s"/>`, offset, normalizeColor(color, "#ffffff")))
		}
		defs = fmt.Sprintf(`<defs><linearGradient id="gradient" gradientTransform="rotate(%s)">%s</linearGradient></defs>`, html.EscapeString(angle), stops.String())
		bg = "url(#gradient)"
	}
	return fmt.Sprintf(`<svg width="%d" height="%d" viewBox="0 0 %d %d" fill="none" xmlns="http://www.w3.org/2000/svg">
<style>
.title{font:600 18px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.stat{font:600 14px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}.regular{font-weight:400}.bold{font-weight:700}
.label{font:600 13px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.value{font:600 13px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.muted{font:400 12px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.desc{font:400 13px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.rank{font:700 38px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.rank-percentile{font:700 16px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.icon{fill:%s}.lang-name{font:400 13px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.rank-circle-rim{stroke:%s;fill:none;stroke-width:6;opacity:.2}.rank-circle{stroke:%s;fill:none;stroke-width:6;stroke-linecap:round;opacity:.85}
</style>
%s
<rect x="0.5" y="0.5" width="%d" height="%d" rx="%.1f" fill="%s" stroke="%s"/>
%s
%s
%s
</svg>`, width, height, width, height, opts.TitleColor, opts.TextColor, opts.TextColor, opts.IconColor, opts.TextColor, opts.TextColor, opts.TitleColor, opts.TextColor, opts.IconColor, opts.TextColor, opts.RingColor, opts.RingColor, defs, width-1, height-1, opts.BorderRadius, bg, stroke, titleNode, body, overlay)
}

func writeSVG(w http.ResponseWriter, cacheSeconds int, svg string) {
	w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if os.Getenv("NODE_ENV") == "development" || cacheSeconds < 1 {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0, s-maxage=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
	} else {
		w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, s-maxage=%d, stale-while-revalidate=86400", cacheSeconds, cacheSeconds))
	}
	etag := weakETag(svg)
	w.Header().Set("ETag", etag)
	_, _ = w.Write([]byte(svg))
}

func writeSVGError(w http.ResponseWriter, message string, secondary string) {
	w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, s-maxage=%d, stale-while-revalidate=86400", errorCacheSeconds, errorCacheSeconds))
	writeSVG(w, errorCacheSeconds, cardSVG(576, 120, cardOptionsFromQuery(map[string][]string{}), "Something went wrong!", fmt.Sprintf(`<text x="25" y="66" class="label">%s</text><text x="25" y="88" class="muted">%s</text>`, html.EscapeString(message), html.EscapeString(secondary)), ""))
}

func weakETag(body string) string {
	sum := sha1.Sum([]byte(body))
	return fmt.Sprintf(`W/"%x"`, sum)
}

func resolveCacheSeconds(raw string, policy cachePolicy) int {
	value := policy.Default
	if parsed, err := strconv.Atoi(raw); err == nil {
		value = parsed
	}
	if env := os.Getenv("CACHE_SECONDS"); env != "" {
		if parsed, err := strconv.Atoi(env); err == nil {
			value = parsed
		}
	}
	if value < policy.Min {
		return policy.Min
	}
	if value > policy.Max {
		return policy.Max
	}
	return value
}

func parseBool(raw string) bool {
	switch strings.ToLower(raw) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func parseCSV(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func parseIntDefault(raw string, fallback int) int {
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func parseFloatDefault(raw string, fallback float64) float64 {
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return fallback
	}
	return value
}

func normalizeColor(raw string, fallback string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	if strings.Contains(raw, ",") {
		raw = strings.Split(raw, ",")[0]
	}
	raw = strings.TrimPrefix(raw, "#")
	if matched, _ := regexp.MatchString(`^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$`, raw); matched {
		return "#" + raw
	}
	return fallback
}

func normalizeBgColor(raw string, fallback string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	if strings.Contains(raw, ",") {
		parts := strings.Split(raw, ",")
		if len(parts) < 2 {
			return fallback
		}
		for i := 1; i < len(parts); i++ {
			parts[i] = normalizeColor(parts[i], "")
			if parts[i] == "" {
				return fallback
			}
		}
		return strings.Join(parts, ",")
	}
	return normalizeColor(raw, fallback)
}

func defaultColor(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func colorForName(name string) string {
	palette := []string{"#3572A5", "#f1e05a", "#2b7489", "#00ADD8", "#dea584", "#89e051", "#701516", "#4F5D95"}
	sum := sha1.Sum([]byte(name))
	return palette[int(sum[0])%len(palette)]
}

func setFromStrings(values []string) map[string]bool {
	set := make(map[string]bool, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			set[value] = true
			set[strings.ToLower(value)] = true
		}
	}
	return set
}

func formatNumber(value int) string {
	switch {
	case value >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(value)/1_000_000)
	case value >= 1_000:
		return fmt.Sprintf("%.1fk", float64(value)/1_000)
	default:
		return strconv.Itoa(value)
	}
}

func formatNumberWithOptions(value int, opts cardOptions) string {
	if opts.NumberFormat == "long" {
		return formatIntWithCommas(value)
	}
	if opts.NumberPrecision >= 0 && value >= 1000 && value < 1_000_000 {
		divisor := 1000.0
		unit := "k"
		if value >= 1_000_000 {
			divisor = 1_000_000
			unit = "M"
		}
		format := "%." + strconv.Itoa(max(0, opts.NumberPrecision)) + "f%s"
		return fmt.Sprintf(format, float64(value)/divisor, unit)
	}
	return formatNumber(value)
}

func formatIntWithCommas(value int) string {
	sign := ""
	if value < 0 {
		sign = "-"
		value = -value
	}
	raw := strconv.Itoa(value)
	if len(raw) <= 3 {
		return sign + raw
	}
	var out []byte
	prefix := len(raw) % 3
	if prefix == 0 {
		prefix = 3
	}
	out = append(out, raw[:prefix]...)
	for i := prefix; i < len(raw); i += 3 {
		out = append(out, ',')
		out = append(out, raw[i:i+3]...)
	}
	return sign + string(out)
}

func formatBytes(value int64) string {
	units := []string{"B", "KB", "MB", "GB", "TB"}
	size := float64(value)
	unit := 0
	for size >= 1024 && unit < len(units)-1 {
		size /= 1024
		unit++
	}
	if unit == 0 {
		return fmt.Sprintf("%d %s", value, units[unit])
	}
	return fmt.Sprintf("%.1f %s", size, units[unit])
}

func wrapText(text string, maxChars int, maxLines int) []string {
	text = strings.TrimSpace(strings.Join(strings.Fields(text), " "))
	if text == "" || maxChars <= 0 || maxLines <= 0 {
		return nil
	}
	words := strings.Fields(text)
	lines := make([]string, 0, maxLines)
	current := ""
	for _, word := range words {
		if runeLen(word) > maxChars {
			word = truncate(word, maxChars)
		}
		next := word
		if current != "" {
			next = current + " " + word
		}
		if runeLen(next) <= maxChars {
			current = next
			continue
		}
		lines = append(lines, current)
		current = word
		if len(lines) == maxLines {
			break
		}
	}
	if current != "" && len(lines) < maxLines {
		lines = append(lines, current)
	}
	if len(lines) == maxLines && strings.Join(lines, " ") != text {
		lines[len(lines)-1] = truncate(lines[len(lines)-1], max(4, maxChars-1))
	}
	return lines
}

func renderTextLines(lines []string, x int, y int, lineHeight int, className string) string {
	var out strings.Builder
	for i, line := range lines {
		out.WriteString(fmt.Sprintf(`<text x="%d" y="%d" class="%s">%s</text>`, x, y+i*lineHeight, html.EscapeString(className), html.EscapeString(line)))
	}
	return out.String()
}

func filterLangs(langs []languageStat, count int, hide []string) ([]languageStat, float64) {
	hidden := setFromStrings(hide)
	filtered := make([]languageStat, 0, count)
	total := 0.0
	for _, lang := range langs {
		if hidden[lang.Name] || hidden[strings.ToLower(lang.Name)] {
			continue
		}
		filtered = append(filtered, lang)
		total += lang.Size
		if len(filtered) == count {
			break
		}
	}
	return filtered, total
}

func percentOf(value float64, total float64) float64 {
	if total <= 0 {
		return 0
	}
	return value / total * 100
}

func langDisplayValue(size float64, percent float64, statsFormat string) string {
	switch strings.ToLower(statsFormat) {
	case "bytes":
		return formatBytes(int64(size))
	case "count":
		return strconv.Itoa(int(math.Round(size)))
	default:
		return fmt.Sprintf("%.2f%%", percent)
	}
}

func renderRank(opts cardOptions, level string, percentile float64, x int, y int) string {
	if level == "" {
		level = "C"
	}
	circumference := 2 * math.Pi * 38
	progress := math.Max(0.08, math.Min(1, (100-percentile)/100))
	dash := progress * circumference
	center := fmt.Sprintf(`<text x="40" y="52" text-anchor="middle" class="rank">%s</text>`, html.EscapeString(level))
	switch strings.ToLower(opts.RankIcon) {
	case "github":
		center = fmt.Sprintf(`<svg class="rank-github" x="13" y="13" viewBox="0 0 16 16" width="54" height="54"><path fill="%s" d="%s"/></svg>`, opts.IconColor, githubLogoPath)
	case "percentile":
		center = fmt.Sprintf(`<text x="40" y="47" text-anchor="middle" class="rank-percentile">%.1f%%</text>`, math.Max(0, 100-percentile))
	}
	return fmt.Sprintf(`<g transform="translate(%d,%d)"><circle class="rank-circle-rim" cx="40" cy="40" r="38"/><circle class="rank-circle" cx="40" cy="40" r="38" stroke-dasharray="%.1f %.1f" transform="rotate(-90 40 40)"/>%s</g>`, x, y, dash, circumference, center)
}

func pieSlice(cx float64, cy float64, r float64, start float64, end float64, color string) string {
	if end <= start {
		return ""
	}
	startX, startY := polarPoint(cx, cy, r, start)
	endX, endY := polarPoint(cx, cy, r, end)
	largeArc := 0
	if end-start > 180 {
		largeArc = 1
	}
	return fmt.Sprintf(`<path d="M %.2f %.2f L %.2f %.2f A %.2f %.2f 0 %d 1 %.2f %.2f Z" fill="%s"/>`, cx, cy, startX, startY, r, r, largeArc, endX, endY, color)
}

func donutArc(cx float64, cy float64, r float64, start float64, end float64, color string) string {
	if end <= start {
		return ""
	}
	startX, startY := polarPoint(cx, cy, r, start)
	endX, endY := polarPoint(cx, cy, r, end)
	largeArc := 0
	if end-start > 180 {
		largeArc = 1
	}
	return fmt.Sprintf(`<path d="M %.2f %.2f A %.2f %.2f 0 %d 1 %.2f %.2f" fill="none" stroke="%s" stroke-width="24" stroke-linecap="butt"/>`, startX, startY, r, r, largeArc, endX, endY, color)
}

func polarPoint(cx float64, cy float64, r float64, angle float64) (float64, float64) {
	radians := angle * math.Pi / 180
	return cx + r*math.Cos(radians), cy + r*math.Sin(radians)
}

func runeLen(value string) int {
	return len([]rune(value))
}

func truncate(value string, maxLen int) string {
	value = strings.TrimSpace(value)
	if len([]rune(value)) <= maxLen {
		return value
	}
	runes := []rune(value)
	return string(runes[:maxLen-1]) + "..."
}

func max(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

const (
	svgIconStar     = `<path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>`
	svgIconCommits  = `<path d="M5.75 7.25a2.25 2.25 0 1 0 0 1.5h4.5a2.25 2.25 0 1 0 0-1.5h-4.5ZM4 8a.75.75 0 1 1-1.5 0A.75.75 0 0 1 4 8Zm9.5 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"/><path d="M1.75 3.5A1.75 1.75 0 0 1 3.5 1.75h9A1.75 1.75 0 0 1 14.25 3.5v9a1.75 1.75 0 0 1-1.75 1.75h-9a1.75 1.75 0 0 1-1.75-1.75v-9ZM3.5 3.25a.25.25 0 0 0-.25.25v9c0 .138.112.25.25.25h9a.25.25 0 0 0 .25-.25v-9a.25.25 0 0 0-.25-.25h-9Z"/>`
	svgIconPRs      = `<path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm2.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm7-9.5a.75.75 0 0 0-.75.75v2.19l.72-.72a.75.75 0 1 1 1.06 1.06l-2 2a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06l.72.72V3.25a2.25 2.25 0 1 1 2.25 2.25.75.75 0 0 1 0-1.5.75.75 0 0 0 0-1.5Z"/>`
	svgIconIssues   = `<path d="M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5ZM.25 8a7.75 7.75 0 1 1 15.5 0A7.75 7.75 0 0 1 .25 8ZM8 4.75a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4.75Zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>`
	svgIconContribs = `<path d="M5 3.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-1.5 0V5.06L4.03 13.53a.75.75 0 0 1-1.06-1.06L11.44 4H5.75A.75.75 0 0 1 5 3.25Z"/>`
	svgIconFork     = `<path d="M5 3.25a2.25 2.25 0 1 0-1.5 2.122v5.256a2.25 2.25 0 1 0 1.5 0V8.75h3.25A2.75 2.75 0 0 0 11 6V5.372a2.25 2.25 0 1 0-1.5 0V6c0 .69-.56 1.25-1.25 1.25H5V5.372A2.25 2.25 0 0 0 5 3.25ZM3.75 2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm0 9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm6.5-9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"/>`
	githubLogoPath  = `M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z`
)
