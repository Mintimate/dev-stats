package service

import (
	"context"
	"net/http"
	"testing"
	"time"
)

func TestFetchStarHistoryPages(t *testing.T) {
	sunday := time.Date(2025, time.August, 10, 0, 0, 0, 0, time.UTC)
	var requests []string
	client := &Client{tokens: []string{"test-token"}, httpClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodGet || r.URL.Host != "api.github.com" || r.Header.Get("X-GitHub-Api-Version") != "2026-03-10" || r.Header.Get("Authorization") != "" {
			t.Fatalf("unexpected public GitHub request: %s %s", r.Method, r.URL)
		}
		path := r.URL.RequestURI()
		requests = append(requests, path)
		switch path {
		case "/repos/alice/example":
			return testJSONResponse(http.StatusOK, starHistoryRepository{ID: 42, FullName: "Alice/example", Visibility: "public", CreatedAt: sunday}), nil
		case "/repositories/42/stargazers/history?per_page=30&page=1":
			response := testJSONResponse(http.StatusOK, []starHistoryWeek{{Week: sunday.AddDate(0, 0, 7).Unix(), Total: 4, Days: []int{0, 4, 0, 0, 0, 0, 0}}})
			response.Header.Set("Link", `<https://example.org/not-used?page=2>; rel="next"`)
			return response, nil
		case "/repositories/42/stargazers/history?per_page=30&page=2":
			return testJSONResponse(http.StatusOK, []starHistoryWeek{{Week: sunday.Unix(), Total: 3, Days: []int{0, 1, 0, 0, 0, 0, 2}}}), nil
		default:
			t.Fatalf("unexpected GitHub request: %s", r.URL)
			return nil, nil
		}
	})}}
	data, err := client.FetchStarHistory(context.Background(), "alice", "example")
	if err != nil {
		t.Fatal(err)
	}
	if len(requests) != 3 || data.FullName != "Alice/example" || data.TotalStars != 7 || len(data.Points) != 14 {
		t.Fatalf("unexpected GitHub star history: requests=%v data=%+v", requests, data)
	}
	wantCounts := []int{0, 1, 1, 1, 1, 1, 3, 3, 7, 7, 7, 7, 7, 7}
	for i, count := range wantCounts {
		point := data.Points[i]
		if !point.Date.Equal(sunday.AddDate(0, 0, i)) || point.Count != count {
			t.Errorf("day %d: got %v, want %s / %d", i, point, sunday.AddDate(0, 0, i), count)
		}
	}
}

func TestFetchStarHistoryVisibility(t *testing.T) {
	for _, test := range []struct {
		name       string
		visibility string
		private    bool
	}{
		{"private", "private", true},
		{"internal", "internal", false},
		{"unspecified", "", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			client := &Client{httpClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				if r.URL.Path != "/repos/alice/example" {
					t.Fatalf("requested history for a non-public repository: %s", r.URL)
				}
				return testJSONResponse(http.StatusOK, starHistoryRepository{
					ID: 42, FullName: "alice/example", Visibility: test.visibility, Private: test.private,
					CreatedAt: time.Date(2025, time.August, 10, 0, 0, 0, 0, time.UTC),
				}), nil
			})}}
			data, err := client.FetchStarHistory(context.Background(), "alice", "example")
			if err == nil || err.Error() != "repository not found" || data.FullName != "" || len(data.Points) != 0 {
				t.Fatalf("non-public repository returned data: %+v, err=%v", data, err)
			}
		})
	}
}

func TestFetchStarHistoryValidatesTerminalPage(t *testing.T) {
	sunday := time.Date(2025, time.August, 10, 0, 0, 0, 0, time.UTC)
	created := sunday.AddDate(0, 0, 6)
	for _, test := range []struct {
		name  string
		weeks []starHistoryWeek
		want  string
	}{
		{"null page", nil, "GitHub returned an invalid star history page"},
		{"empty page", []starHistoryWeek{}, "GitHub returned an invalid star history page"},
		{"truncated history", []starHistoryWeek{{Week: sunday.AddDate(0, 0, 14).Unix(), Days: make([]int, 7)}}, "GitHub returned incomplete star history"},
		{"zero stars", []starHistoryWeek{{Week: sunday.Unix(), Days: make([]int, 7)}}, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			client := &Client{httpClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				switch r.URL.Path {
				case "/repos/alice/example":
					return testJSONResponse(http.StatusOK, starHistoryRepository{
						ID: 42, FullName: "alice/example", Visibility: "public", CreatedAt: created,
					}), nil
				case "/repositories/42/stargazers/history":
					return testJSONResponse(http.StatusOK, test.weeks), nil
				default:
					t.Fatalf("unexpected request: %s", r.URL)
					return nil, nil
				}
			})}}
			data, err := client.FetchStarHistory(context.Background(), "alice", "example")
			if test.want != "" {
				if err == nil || err.Error() != test.want {
					t.Fatalf("got error %v, want %q", err, test.want)
				}
				return
			}
			if err != nil || data.TotalStars != 0 || len(data.Points) != 1 || !data.Points[0].Date.Equal(created) {
				t.Fatalf("unexpected zero-star history: data=%+v err=%v", data, err)
			}
		})
	}
}

func TestFetchStarHistoryStopsAtRateLimit(t *testing.T) {
	requests := 0
	client := &Client{tokens: []string{"test-token"}, httpClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests++
		if r.Header.Get("Authorization") != "" {
			t.Fatal("unexpected authorization")
		}
		response := testJSONResponse(http.StatusForbidden, nil)
		response.Header.Set("Retry-After", "60")
		return response, nil
	})}}
	_, err := client.FetchStarHistory(context.Background(), "alice", "example")
	if err == nil || err.Error() != "GitHub API rate limited" || requests != 1 {
		t.Fatalf("expected a single rate-limited request, got %d requests and error %v", requests, err)
	}
}

func TestBuildStarHistoryRejectsMissingWeeks(t *testing.T) {
	sunday := time.Date(2025, time.August, 10, 0, 0, 0, 0, time.UTC)
	weeks := []starHistoryWeek{
		{Week: sunday.AddDate(0, 0, 14).Unix(), Days: make([]int, 7)},
		{Week: sunday.Unix(), Days: make([]int, 7)},
	}
	if _, err := buildStarHistory(starHistoryRepository{CreatedAt: sunday}, weeks, sunday.AddDate(0, 0, 20)); err == nil {
		t.Fatal("missing weeks would produce an incomplete curve")
	}
}
