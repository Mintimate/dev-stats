package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

func (c *Client) FetchStats(ctx context.Context, q StatsQuery) (StatsData, error) {
	variables := map[string]any{
		"login":                     q.Username,
		"includeMergedPullRequests": q.IncludeMergedPRs,
		"includeDiscussions":        q.IncludeDiscussions,
		"includeDiscussionsAnswers": q.IncludeDiscussionAnswers,
	}
	if q.CommitsYear != "" {
		if _, err := strconv.Atoi(q.CommitsYear); err != nil || len(q.CommitsYear) != 4 {
			return StatsData{}, errors.New("commits_year must be a four-digit year")
		}
		variables["startTime"] = q.CommitsYear + "-01-01T00:00:00Z"
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
		return StatsData{}, err
	}
	if response.User.Login == "" {
		return StatsData{}, errors.New("user not found")
	}

	totalCommits := response.User.Commits.TotalCommitContributions
	if q.IncludeAllCommits {
		var rest struct {
			TotalCount int `json:"total_count"`
		}
		// author:<username> 需要整体作为 q 参数值转义，避免用户名中的 &/+/空格等字符篡改查询语义。
		if err := c.restJSON(ctx, "/search/commits?q="+url.QueryEscape("author:"+q.Username), &rest); err == nil && rest.TotalCount > 0 {
			totalCommits = rest.TotalCount
		}
	}

	// 复制一份再 append，避免共享 q.ExcludeRepos 的底层数组（若 StatsQuery 被复用会有数据竞争隐患）。
	excluded := setFromStrings(append(append([]string{}, q.ExcludeRepos...), parseCSV(os.Getenv("EXCLUDE_REPO"))...))
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
	level, percentile := calculateRank(q.IncludeAllCommits, totalCommits, response.User.PullRequests.TotalCount, response.User.OpenIssues.TotalCount+response.User.ClosedIssues.TotalCount, response.User.Reviews.TotalPullRequestReviewContributions, totalStars, response.User.Followers.TotalCount)

	return StatsData{
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

func (c *Client) FetchContributionCalendar(ctx context.Context, username string) (string, []ContributionDay, error) {
	query := `
query ContributionCalendar($login: String!) {
  user(login: $login) {
    name
    login
    contributionsCollection {
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`
	var response struct {
		User struct {
			Name                    string `json:"name"`
			Login                   string `json:"login"`
			ContributionsCollection struct {
				ContributionCalendar struct {
					Weeks []struct {
						ContributionDays []struct {
							Date              string `json:"date"`
							ContributionCount int    `json:"contributionCount"`
						} `json:"contributionDays"`
					} `json:"weeks"`
				} `json:"contributionCalendar"`
			} `json:"contributionsCollection"`
		} `json:"user"`
	}
	if err := c.graphQL(ctx, query, map[string]any{"login": username}, &response); err != nil {
		return "", nil, err
	}
	if response.User.Login == "" {
		return "", nil, errors.New("user not found")
	}
	days := make([]ContributionDay, 0, 371)
	for _, week := range response.User.ContributionsCollection.ContributionCalendar.Weeks {
		for _, day := range week.ContributionDays {
			days = append(days, ContributionDay{Date: day.Date, Count: day.ContributionCount})
		}
	}
	sort.Slice(days, func(i, j int) bool { return days[i].Date < days[j].Date })
	name := response.User.Name
	if name == "" {
		name = response.User.Login
	}
	return name, days, nil
}

func CalculateStreak(name string, days []ContributionDay) StreakData {
	data := StreakData{Name: name}
	if len(days) == 0 {
		return data
	}
	data.FirstDate, data.LastDate = days[0].Date, days[len(days)-1].Date
	longestStart := 0
	runStart, runLength := 0, 0
	for i, day := range days {
		data.Total += day.Count
		if day.Count > 0 {
			data.ContributionDays++
			if runLength == 0 {
				runStart = i
			}
			runLength++
			if runLength > data.Longest {
				data.Longest = runLength
				longestStart = runStart
				data.LongestStart = days[longestStart].Date
				data.LongestEnd = day.Date
			}
		} else {
			runLength = 0
		}
	}
	last := len(days) - 1
	if days[last].Count == 0 && days[last].Date == time.Now().Format("2006-01-02") {
		last--
	}
	end := last
	for last >= 0 && days[last].Count > 0 {
		data.Current++
		last--
	}
	if data.Current > 0 {
		data.CurrentStart = days[last+1].Date
		data.CurrentEnd = days[end].Date
	}
	return data
}

func (c *Client) FetchProfileSummary(ctx context.Context, username string) (ProfileSummaryData, error) {
	query := `
query ProfileSummary($login: String!) {
  user(login: $login) {
    name login avatarUrl createdAt
    followers { totalCount }
    following { totalCount }
    gists(first: 1) { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER) {
      totalCount
      nodes { stargazerCount forkCount }
    }
    pullRequests(first: 1) { totalCount }
    issues(first: 1) { totalCount }
    contributionsCollection {
      totalCommitContributions
      contributionYears
    }
  }
}`
	var response struct {
		User struct {
			Name, Login, AvatarURL, CreatedAt                 string
			Followers, Following, Gists, PullRequests, Issues count
			Repositories                                      struct {
				TotalCount int `json:"totalCount"`
				Nodes      []struct {
					StargazerCount int `json:"stargazerCount"`
					ForkCount      int `json:"forkCount"`
				} `json:"nodes"`
			} `json:"repositories"`
			ContributionsCollection struct {
				TotalCommitContributions int   `json:"totalCommitContributions"`
				ContributionYears        []int `json:"contributionYears"`
			} `json:"contributionsCollection"`
		} `json:"user"`
	}
	if err := c.graphQL(ctx, query, map[string]any{"login": username}, &response); err != nil {
		return ProfileSummaryData{}, err
	}
	if response.User.Login == "" {
		return ProfileSummaryData{}, errors.New("user not found")
	}
	data := ProfileSummaryData{
		Name: response.User.Name, Login: response.User.Login, AvatarURL: response.User.AvatarURL,
		Followers: response.User.Followers.TotalCount, Following: response.User.Following.TotalCount,
		Repositories: response.User.Repositories.TotalCount, Gists: response.User.Gists.TotalCount,
		TotalCommits: response.User.ContributionsCollection.TotalCommitContributions,
		TotalPRs:     response.User.PullRequests.TotalCount, TotalIssues: response.User.Issues.TotalCount,
		ActiveYears: response.User.ContributionsCollection.ContributionYears, MemberSince: response.User.CreatedAt,
	}
	if data.Name == "" {
		data.Name = data.Login
	}
	for _, repo := range response.User.Repositories.Nodes {
		data.TotalStars += repo.StargazerCount
		data.TotalForks += repo.ForkCount
	}
	sort.Sort(sort.Reverse(sort.IntSlice(data.ActiveYears)))
	return data, nil
}

func (c *Client) FetchRecentActivity(ctx context.Context, username string, count int) ([]ActivityItem, error) {
	count = minInt(max(count, 1), 10)
	var events []struct {
		Type string `json:"type"`
		Repo struct {
			Name string `json:"name"`
		} `json:"repo"`
		CreatedAt string `json:"created_at"`
		Payload   struct {
			Action  string `json:"action"`
			Size    int    `json:"size"`
			Commits []struct {
				Message string `json:"message"`
			} `json:"commits"`
			PullRequest struct {
				Title   string `json:"title"`
				HTMLURL string `json:"html_url"`
			} `json:"pull_request"`
			Issue struct {
				Title   string `json:"title"`
				HTMLURL string `json:"html_url"`
			} `json:"issue"`
			Release struct {
				Name    string `json:"name"`
				TagName string `json:"tag_name"`
				HTMLURL string `json:"html_url"`
			} `json:"release"`
		} `json:"payload"`
	}
	path := "/users/" + url.PathEscape(username) + "/events/public?per_page=100"
	if err := c.restJSON(ctx, path, &events); err != nil {
		return nil, err
	}
	items := make([]ActivityItem, 0, count)
	for _, event := range events {
		item := ActivityItem{Repo: event.Repo.Name, CreatedAt: event.CreatedAt}
		switch event.Type {
		case "PushEvent":
			item.Type, item.Action = "commit", "pushed"
			item.Title = fmt.Sprintf("Pushed %d commit(s)", event.Payload.Size)
			if len(event.Payload.Commits) > 0 && event.Payload.Commits[0].Message != "" {
				item.Title = strings.Split(event.Payload.Commits[0].Message, "\n")[0]
			}
			item.URL = "https://github.com/" + event.Repo.Name
		case "PullRequestEvent":
			item.Type, item.Action, item.Title, item.URL = "pull-request", event.Payload.Action, event.Payload.PullRequest.Title, event.Payload.PullRequest.HTMLURL
		case "IssuesEvent":
			item.Type, item.Action, item.Title, item.URL = "issue", event.Payload.Action, event.Payload.Issue.Title, event.Payload.Issue.HTMLURL
		case "ReleaseEvent":
			item.Type, item.Action, item.Title, item.URL = "release", event.Payload.Action, event.Payload.Release.Name, event.Payload.Release.HTMLURL
			if item.Title == "" {
				item.Title = event.Payload.Release.TagName
			}
		default:
			continue
		}
		items = append(items, item)
		if len(items) == count {
			break
		}
	}
	return items, nil
}

func (c *Client) FetchRepoLanguages(ctx context.Context, username, repo string, count int) (RepoLanguagesData, error) {
	query := `
query RepoLanguages($owner: String!, $name: String!, $count: Int!) {
  repository(owner: $owner, name: $name) {
    name nameWithOwner
    languages(first: $count, orderBy: {field: SIZE, direction: DESC}) {
      totalSize
      edges { size node { name color } }
    }
  }
}`
	var response struct {
		Repository struct {
			Name, NameWithOwner string
			Languages           struct {
				TotalSize int `json:"totalSize"`
				Edges     []struct {
					Size int                          `json:"size"`
					Node struct{ Name, Color string } `json:"node"`
				} `json:"edges"`
			} `json:"languages"`
		} `json:"repository"`
	}
	count = minInt(max(count, 1), 20)
	if err := c.graphQL(ctx, query, map[string]any{"owner": username, "name": repo, "count": count}, &response); err != nil {
		return RepoLanguagesData{}, err
	}
	if response.Repository.Name == "" {
		return RepoLanguagesData{}, errors.New("repository not found")
	}
	data := RepoLanguagesData{Name: response.Repository.Name, NameWithOwner: response.Repository.NameWithOwner, TotalSize: response.Repository.Languages.TotalSize}
	for _, edge := range response.Repository.Languages.Edges {
		data.Languages = append(data.Languages, LanguageStat{Name: edge.Node.Name, Color: defaultColor(edge.Node.Color, "#858585"), Size: float64(edge.Size)})
	}
	return data, nil
}

func (c *Client) FetchOrganization(ctx context.Context, login string) (OrganizationData, error) {
	queryWithMembers := `
query OrganizationSummary($login: String!) {
  organization(login: $login) {
    name login avatarUrl description
    membersWithRole(first: 1) { totalCount }
    repositories(first: 100, orderBy: {field: STARGAZERS, direction: DESC}) {
      totalCount
      nodes { nameWithOwner stargazerCount forkCount issues(first: 1) { totalCount } }
    }
  }
}`
	var response struct {
		Organization struct {
			Name, Login, AvatarURL, Description string
			MembersWithRole                     count `json:"membersWithRole"`
			Repositories                        struct {
				TotalCount int `json:"totalCount"`
				Nodes      []struct {
					NameWithOwner  string `json:"nameWithOwner"`
					StargazerCount int    `json:"stargazerCount"`
					ForkCount      int    `json:"forkCount"`
					Issues         count  `json:"issues"`
				} `json:"nodes"`
			} `json:"repositories"`
		} `json:"organization"`
	}
	err := c.graphQL(ctx, queryWithMembers, map[string]any{"login": login}, &response)
	hasScopeError := false
	if err != nil {
		errMsg := strings.ToLower(err.Error())
		if strings.Contains(errMsg, "scope") || strings.Contains(errMsg, "memberswithrole") || strings.Contains(errMsg, "name") {
			hasScopeError = true
		}
	}
	if (err != nil && hasScopeError) || (err == nil && response.Organization.Login == "") {
		var restOrg struct {
			Name        string `json:"name"`
			Login       string `json:"login"`
			AvatarURL   string `json:"avatar_url"`
			Description string `json:"description"`
			PublicRepos int    `json:"public_repos"`
		}
		restErr := c.restJSON(ctx, "/orgs/"+url.PathEscape(login), &restOrg)
		if restErr == nil && restOrg.Login != "" {
			searchQuery := `
query OrgRepos($queryString: String!) {
  search(query: $queryString, type: REPOSITORY, first: 100) {
    repositoryCount
    nodes {
      ... on Repository {
        nameWithOwner
        stargazerCount
        forkCount
        issues(states: OPEN) { totalCount }
      }
    }
  }
}`
			var searchResp struct {
				Search struct {
					RepositoryCount int `json:"repositoryCount"`
					Nodes           []struct {
						NameWithOwner  string `json:"nameWithOwner"`
						StargazerCount int    `json:"stargazerCount"`
						ForkCount      int    `json:"forkCount"`
						Issues         count  `json:"issues"`
					} `json:"nodes"`
				} `json:"search"`
			}
			qVar := fmt.Sprintf("org:%s is:public sort:stars-desc", login)
			gqlErr := c.graphQL(ctx, searchQuery, map[string]any{"queryString": qVar}, &searchResp)
			if gqlErr == nil {
				response.Organization.Name = restOrg.Name
				response.Organization.Login = restOrg.Login
				response.Organization.AvatarURL = restOrg.AvatarURL
				response.Organization.Description = restOrg.Description
				response.Organization.Repositories.TotalCount = restOrg.PublicRepos

				response.Organization.Repositories.Nodes = nil
				for _, node := range searchResp.Search.Nodes {
					response.Organization.Repositories.Nodes = append(response.Organization.Repositories.Nodes, struct {
						NameWithOwner  string `json:"nameWithOwner"`
						StargazerCount int    `json:"stargazerCount"`
						ForkCount      int    `json:"forkCount"`
						Issues         count  `json:"issues"`
					}{
						NameWithOwner:  node.NameWithOwner,
						StargazerCount: node.StargazerCount,
						ForkCount:      node.ForkCount,
						Issues:         node.Issues,
					})
				}
				err = nil
			} else {
				err = gqlErr
			}
		} else if restErr != nil {
			err = restErr
		}
	}
	if err != nil {
		return OrganizationData{}, err
	}
	org := response.Organization
	if org.Login == "" {
		return OrganizationData{}, errors.New("organization not found")
	}
	data := OrganizationData{Name: org.Name, Login: org.Login, AvatarURL: org.AvatarURL, Description: org.Description, Repositories: org.Repositories.TotalCount, Members: org.MembersWithRole.TotalCount}
	if data.Name == "" {
		data.Name = data.Login
	}
	for i, repo := range org.Repositories.Nodes {
		data.TotalStars += repo.StargazerCount
		data.TotalForks += repo.ForkCount
		data.TotalIssues += repo.Issues.TotalCount
		if i == 0 {
			data.TopRepository, data.TopRepoStars = repo.NameWithOwner, repo.StargazerCount
		}
	}
	var events []struct {
		Type  string `json:"type"`
		Actor struct {
			Login string `json:"login"`
		} `json:"actor"`
	}
	if err := c.restJSON(ctx, "/orgs/"+url.PathEscape(login)+"/events?per_page=100", &events); err == nil {
		contributors := map[string]int{}
		for _, event := range events {
			switch event.Type {
			case "PushEvent", "PullRequestEvent", "IssuesEvent", "ReleaseEvent":
				if event.Actor.Login == "" {
					continue
				}
				contributors[event.Actor.Login]++
				data.RecentContributions++
			}
		}
		data.ActiveContributors = len(contributors)
		for contributor, eventCount := range contributors {
			if eventCount > data.TopContributorEvents {
				data.TopContributor, data.TopContributorEvents = contributor, eventCount
			}
		}
	}
	return data, nil
}
