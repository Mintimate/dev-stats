package service

import (
	"context"
	"fmt"
	"strings"
)

// Provider is the data-source contract shared by GitHub and CNB cards.
type Provider interface {
	FetchStats(context.Context, string, bool, []string, bool, bool, bool, string) (StatsData, error)
	FetchTopLanguages(context.Context, string, []string, float64, float64) ([]LanguageStat, error)
	FetchRepo(context.Context, string, string) (RepoData, error)
	FetchContributionCalendar(context.Context, string) (string, []ContributionDay, error)
	FetchProfileSummary(context.Context, string) (ProfileSummaryData, error)
	FetchRecentActivity(context.Context, string, int) ([]ActivityItem, error)
	FetchRepoLanguages(context.Context, string, string, int) (RepoLanguagesData, error)
	FetchOrganization(context.Context, string) (OrganizationData, error)
}

func NormalizePlatform(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "github":
		return "github"
	case "cnb":
		return "cnb"
	default:
		return ""
	}
}

func NewProvider(platform string) (Provider, error) {
	switch NormalizePlatform(platform) {
	case "github":
		return NewClient(), nil
	case "cnb":
		return NewCNBClient(), nil
	default:
		return nil, fmt.Errorf("unsupported platform %q; use github or cnb", platform)
	}
}

func PlatformDisplayName(platform string) string {
	if NormalizePlatform(platform) == "cnb" {
		return "CNB"
	}
	return "GitHub"
}
