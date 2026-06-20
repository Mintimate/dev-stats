package service

import (
	"encoding/json"
	"net/http"
)

var (
	githubGraphQLEndpoint = "https://api.github.com/graphql"
	githubRESTEndpoint    = "https://api.github.com"
)

type graphQLResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []graphQLError  `json:"errors,omitempty"`
}

type graphQLError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
}

type Client struct {
	httpClient *http.Client
	tokens     []string
}

type StatsData struct {
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

type RepoData struct {
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

type LanguageStat struct {
	Name  string
	Color string
	Size  float64
	Count int
}

type GistData struct {
	Name          string
	NameWithOwner string
	Description   string
	Language      string
	Stars         int
	Forks         int
}

type WakatimeLanguage struct {
	Name    string  `json:"name"`
	Percent float64 `json:"percent"`
	Text    string  `json:"text"`
}

type ContributionDay struct {
	Date  string
	Count int
}

type StreakData struct {
	Name             string
	Current          int
	CurrentStart     string
	CurrentEnd       string
	Longest          int
	LongestStart     string
	LongestEnd       string
	Total            int
	FirstDate        string
	LastDate         string
	ContributionDays int
}

type ProfileSummaryData struct {
	Name         string
	Login        string
	AvatarURL    string
	Followers    int
	Following    int
	Repositories int
	Gists        int
	TotalStars   int
	TotalForks   int
	TotalCommits int
	TotalPRs     int
	TotalIssues  int
	ActiveYears  []int
	MemberSince  string
}

type ActivityItem struct {
	Type      string
	Repo      string
	Title     string
	Action    string
	CreatedAt string
	URL       string
}

type RepoLanguagesData struct {
	Name          string
	NameWithOwner string
	TotalSize     int
	Languages     []LanguageStat
}

type OrganizationData struct {
	Name                 string
	Login                string
	AvatarURL            string
	Description          string
	Repositories         int
	Members              int
	TotalStars           int
	TotalForks           int
	TotalIssues          int
	TopRepository        string
	TopRepoStars         int
	ActiveContributors   int
	RecentContributions  int
	TopContributor       string
	TopContributorEvents int
}
