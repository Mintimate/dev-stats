package service

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"sync"
	"time"
)

const (
	starHistoryCacheTTL      = 5 * time.Minute
	starHistoryCacheCapacity = 32
	starHistoryMaxLoads      = 8
)

// StarHistoryClient shares complete history between requests within a Go process.
type StarHistoryClient struct {
	httpClient *http.Client
	now        func() time.Time

	mu       sync.Mutex
	cached   map[int64]cachedStarHistory
	inFlight map[int64]*starHistoryLoad
}

type cachedStarHistory struct {
	data      StarHistoryData
	expiresAt time.Time
}

type starHistoryLoad struct {
	done chan struct{}
	data StarHistoryData
	err  error
}

func NewStarHistoryClient() *StarHistoryClient {
	return &StarHistoryClient{
		httpClient: &http.Client{Timeout: 12 * time.Second},
		now:        time.Now,
		cached:     make(map[int64]cachedStarHistory),
		inFlight:   make(map[int64]*starHistoryLoad),
	}
}

func (c *StarHistoryClient) loadHistory(ctx context.Context, repo starHistoryRepository) (StarHistoryData, error) {
	if err := ctx.Err(); err != nil {
		return StarHistoryData{}, err
	}
	c.mu.Lock()
	if entry, ok := c.cached[repo.ID]; ok {
		if c.now().Before(entry.expiresAt) {
			c.mu.Unlock()
			return historyForRepository(entry.data, repo.FullName), nil
		}
		delete(c.cached, repo.ID)
	}
	load := c.inFlight[repo.ID]
	if load == nil {
		if len(c.inFlight) >= starHistoryMaxLoads {
			c.mu.Unlock()
			return StarHistoryData{}, errors.New("GitHub Star History is busy, try again shortly")
		}
		load = &starHistoryLoad{done: make(chan struct{})}
		c.inFlight[repo.ID] = load
		go c.finishHistoryLoad(repo, load)
	}
	c.mu.Unlock()

	select {
	case <-ctx.Done():
		return StarHistoryData{}, ctx.Err()
	case <-load.done:
		if load.err != nil {
			return StarHistoryData{}, load.err
		}
		return historyForRepository(load.data, repo.FullName), nil
	}
}

func (c *StarHistoryClient) finishHistoryLoad(repo starHistoryRepository, load *starHistoryLoad) {
	// A canceled image request must not cancel the load for other themes.
	ctx, cancel := context.WithTimeout(context.Background(), starHistoryTimeout)
	defer cancel()

	load.data, load.err = c.fetchHistoryPages(ctx, repo)
	c.mu.Lock()
	if load.err == nil {
		if len(c.cached) == starHistoryCacheCapacity {
			var oldestID int64
			var oldest time.Time
			for id, entry := range c.cached {
				if oldest.IsZero() || entry.expiresAt.Before(oldest) {
					oldestID, oldest = id, entry.expiresAt
				}
			}
			delete(c.cached, oldestID)
		}
		c.cached[repo.ID] = cachedStarHistory{data: load.data, expiresAt: c.now().Add(starHistoryCacheTTL)}
	}
	delete(c.inFlight, repo.ID)
	close(load.done)
	c.mu.Unlock()
}

func historyForRepository(data StarHistoryData, fullName string) StarHistoryData {
	data.FullName = fullName
	data.Points = slices.Clone(data.Points)
	return data
}
