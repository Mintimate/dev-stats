package card

import (
	"strings"
	"testing"

	"dev-stats/cloud-functions/internal/service"
)

func TestLanguageCoverageCardsDoNotClaimCodePercentages(t *testing.T) {
	langs := []service.LanguageStat{
		{Name: "Go", Color: "#00ADD8", Size: 2, Count: 2, CoverageOnly: true},
		{Name: "HTML", Color: "#e34c26", Size: 1, Count: 1, CoverageOnly: true},
	}
	topLanguages := RenderTopLangsCard(langs, Options{}, 6, nil)
	if !strings.Contains(topLanguages, "Repository Language Coverage") || !strings.Contains(topLanguages, "2 repos") {
		t.Fatalf("coverage card did not describe repository frequency: %s", topLanguages)
	}
	if strings.Contains(topLanguages, "66.67%") {
		t.Fatalf("coverage card must not claim a source-byte percentage: %s", topLanguages)
	}

	repoLanguages := RenderRepoLanguagesCard(service.RepoLanguagesData{
		NameWithOwner: "alice/project",
		TotalSize:     2,
		TotalLabel:    "2 detected languages",
		Languages: []service.LanguageStat{
			{Name: "Go", Color: "#00ADD8", Size: 1, Count: 1, CoverageOnly: true},
			{Name: "HTML", Color: "#e34c26", Size: 1, Count: 1, CoverageOnly: true},
		},
		CoverageOnly: true,
	}, Options{})
	if !strings.Contains(repoLanguages, "alice/project Language Coverage") || strings.Contains(repoLanguages, "66.67%") {
		t.Fatalf("repository coverage card used an inaccurate percentage: %s", repoLanguages)
	}
}
