package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"
)

func TestStarHistoryCacheReusesPagesAcrossRepositoryNames(t *testing.T) {
	week := time.Date(2025, time.August, 10, 0, 0, 0, 0, time.UTC)
	now := week.Add(time.Hour)
	metadata := starHistoryRepository{ID: 42, FullName: "Alice/example", CreatedAt: week, Visibility: "public"}
	metadataCalls, historyCalls := 0, 0
	client := NewStarHistoryClient()
	client.now = func() time.Time { return now }
	client.httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		switch strings.ToLower(req.URL.Path) {
		case "/repos/alice/example", "/repos/alice/renamed":
			metadataCalls++
			return testJSONResponse(http.StatusOK, metadata), nil
		case "/repositories/42/stargazers/history":
			historyCalls++
			return starHistoryCacheTestPage(week, historyCalls), nil
		default:
			return nil, fmt.Errorf("unexpected GitHub request: %s", req.URL)
		}
	})}

	assertHistory := func(owner, repo, fullName string, stars int) {
		t.Helper()
		data, err := client.FetchStarHistory(t.Context(), owner, repo)
		if err != nil || data.FullName != fullName || data.TotalStars != stars {
			t.Fatalf("%s/%s got %+v and %v, want %s with %d stars", owner, repo, data, err, fullName, stars)
		}
	}

	assertHistory("Alice", "example", "Alice/example", 1)
	assertHistory("ALICE", "EXAMPLE", "Alice/example", 1)
	metadata.FullName = "Alice/renamed"
	assertHistory("alice", "renamed", "Alice/renamed", 1)
	if metadataCalls != 3 || historyCalls != 1 {
		t.Fatalf("got %d metadata and %d history requests, want 3 and 1", metadataCalls, historyCalls)
	}

	metadata.Visibility = "private"
	data, err := client.FetchStarHistory(t.Context(), "alice", "renamed")
	if err == nil || len(data.Points) != 0 || historyCalls != 1 {
		t.Fatalf("private metadata returned cached history: data=%+v err=%v history requests=%d", data, err, historyCalls)
	}
	metadata.Visibility = "public"
	now = now.Add(starHistoryCacheTTL + time.Second)
	assertHistory("alice", "renamed", "Alice/renamed", 2)
	if metadataCalls != 5 || historyCalls != 2 {
		t.Fatalf("got %d metadata and %d history requests, want 5 and 2", metadataCalls, historyCalls)
	}
}

func TestStarHistoryCacheCoalescesConcurrentRequestsAcrossCancellation(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		week := time.Date(1999, time.December, 26, 0, 0, 0, 0, time.UTC)
		var historyCalls atomic.Int32
		started := make(chan struct{})
		release := make(chan struct{})
		client := NewStarHistoryClient()
		client.httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch strings.ToLower(req.URL.Path) {
			case "/repos/alice/example":
				return testJSONResponse(http.StatusOK, starHistoryRepository{
					ID: 42, FullName: "Alice/example", CreatedAt: week, Visibility: "public",
				}), nil
			case "/repositories/42/stargazers/history":
				if historyCalls.Add(1) == 1 {
					close(started)
				}
				select {
				case <-release:
					return starHistoryCacheTestPage(week, 7), nil
				case <-req.Context().Done():
					return nil, req.Context().Err()
				}
			default:
				return nil, fmt.Errorf("unexpected GitHub request: %s", req.URL)
			}
		})}

		type historyResult struct {
			data StarHistoryData
			err  error
		}
		fetch := func(ctx context.Context, owner, repo string) <-chan historyResult {
			result := make(chan historyResult, 1)
			go func() {
				data, err := client.FetchStarHistory(ctx, owner, repo)
				result <- historyResult{data: data, err: err}
			}()
			return result
		}

		firstContext, cancelFirst := context.WithCancel(t.Context())
		defer cancelFirst()
		first := fetch(firstContext, "alice", "example")
		<-started
		second := fetch(t.Context(), "ALICE", "EXAMPLE")
		synctest.Wait()
		cancelFirst()
		synctest.Wait()
		select {
		case result := <-first:
			if !errors.Is(result.err, context.Canceled) {
				t.Errorf("canceled caller returned %v", result.err)
			}
		default:
			t.Error("canceled caller stayed blocked by GitHub request")
		}
		close(release)
		result := <-second
		if result.err != nil || result.data.TotalStars != 7 {
			t.Fatalf("remaining caller got %+v and %v", result.data, result.err)
		}
		if got := historyCalls.Load(); got != 1 {
			t.Fatalf("got %d history requests, want 1", got)
		}
	})
}

func TestStarHistoryCacheDoesNotStoreFailedFetch(t *testing.T) {
	week := time.Date(2025, time.August, 10, 0, 0, 0, 0, time.UTC)
	historyCalls := 0
	client := NewStarHistoryClient()
	client.httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/repos/alice/example":
			return testJSONResponse(http.StatusOK, starHistoryRepository{
				ID: 42, FullName: "Alice/example", CreatedAt: week, Visibility: "public",
			}), nil
		case "/repositories/42/stargazers/history":
			historyCalls++
			if historyCalls == 1 {
				return testJSONResponse(http.StatusBadGateway, nil), nil
			}
			return starHistoryCacheTestPage(week, 7), nil
		default:
			return nil, fmt.Errorf("unexpected GitHub request: %s", req.URL)
		}
	})}

	if _, err := client.FetchStarHistory(t.Context(), "alice", "example"); err == nil {
		t.Fatal("expected a GitHub error")
	}
	for range 2 {
		data, err := client.FetchStarHistory(t.Context(), "alice", "example")
		if err != nil || data.TotalStars != 7 {
			t.Fatalf("got %+v and %v, want 7 stars", data, err)
		}
	}
	if historyCalls != 2 {
		t.Fatalf("got %d history requests, want 2", historyCalls)
	}
}

func starHistoryCacheTestPage(week time.Time, stars int) *http.Response {
	return testJSONResponse(http.StatusOK, []starHistoryWeek{
		{Week: week.Unix(), Total: stars, Days: []int{stars, 0, 0, 0, 0, 0, 0}},
	})
}
