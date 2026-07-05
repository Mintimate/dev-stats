package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// githubTokenPattern 预编译一次，避免在 NewClient / PATInfo 的 os.Environ 循环里重复编译。
var githubTokenPattern = regexp.MustCompile(`^GITHUB_TOKEN_\d+$`)

func NewClient() *Client {
	tokens := make([]string, 0)
	if tok := os.Getenv("GITHUB_TOKEN"); tok != "" {
		tokens = append(tokens, tok)
	}

	keys := make([]string, 0)
	for _, env := range os.Environ() {
		key, value, ok := strings.Cut(env, "=")
		if !ok || value == "" {
			continue
		}
		if githubTokenPattern.MatchString(key) {
			keys = append(keys, key)
		}
	}
	sort.Slice(keys, func(i, j int) bool { return naturalTokenLess(keys[i], keys[j]) })

	for _, key := range keys {
		tokens = append(tokens, os.Getenv(key))
	}

	return &Client{
		httpClient: &http.Client{Timeout: 12 * time.Second},
		tokens:     tokens,
	}
}

func naturalTokenLess(a, b string) bool {
	an, _ := strconv.Atoi(strings.TrimPrefix(a, "GITHUB_TOKEN_"))
	bn, _ := strconv.Atoi(strings.TrimPrefix(b, "GITHUB_TOKEN_"))
	return an < bn
}

func (c *Client) graphQL(ctx context.Context, query string, variables map[string]any, target any) error {
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

func (c *Client) restJSON(ctx context.Context, path string, target any) error {
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

func (c *Client) HasUsableToken(ctx context.Context) bool {
	var data struct {
		RateLimit struct {
			Remaining int `json:"remaining"`
		} `json:"rateLimit"`
	}
	err := c.graphQL(ctx, `query { rateLimit { remaining } }`, map[string]any{}, &data)
	return err == nil
}

func (c *Client) PATInfo(ctx context.Context) map[string]any {
	result := map[string]any{
		"validPATs":     []string{},
		"expiredPATs":   []string{},
		"exhaustedPATs": []string{},
		"errorPATs":     []string{},
		"details":       map[string]any{},
	}

	keys := make([]string, 0)
	if tok := os.Getenv("GITHUB_TOKEN"); tok != "" {
		keys = append(keys, "GITHUB_TOKEN")
	}

	subKeys := make([]string, 0)
	for _, env := range os.Environ() {
		key, _, ok := strings.Cut(env, "=")
		if ok && githubTokenPattern.MatchString(key) {
			subKeys = append(subKeys, key)
		}
	}
	sort.Slice(subKeys, func(i, j int) bool { return naturalTokenLess(subKeys[i], subKeys[j]) })
	keys = append(keys, subKeys...)

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

func (c *Client) singlePATStatus(ctx context.Context, token string) map[string]any {
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

func (c *Client) FetchAvatarURL(ctx context.Context, username string) (string, error) {
	var u struct {
		AvatarURL string `json:"avatar_url"`
	}
	err := c.restJSON(ctx, "/users/"+url.PathEscape(username), &u)
	if err != nil {
		return "", err
	}
	return u.AvatarURL, nil
}

