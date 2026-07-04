package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"dev-stats/cloud-functions/internal/card"
	"dev-stats/cloud-functions/internal/service"
)

func handleStats(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	if username == "" {
		writeSVGError(w, "Missing username", "Use /api?username=USERNAME")
		return
	}

	client, err := service.NewProvider(q.Get("platform"))
	if err != nil {
		writeSVGError(w, err.Error(), "Invalid platform")
		return
	}
	data, err := client.FetchStats(r.Context(), username, parseBool(q.Get("include_all_commits")), parseCSV(q.Get("exclude_repo")), parseBool(q.Get("show_prs_merged")) || strings.Contains(q.Get("show"), "prs_merged"), strings.Contains(q.Get("show"), "discussions_started"), strings.Contains(q.Get("show"), "discussions_answered"), q.Get("commits_year"))
	if err != nil {
		writeSVGError(w, err.Error(), service.PlatformDisplayName(q.Get("platform"))+" API request failed")
		return
	}

	cacheSeconds := resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["stats"])
	writeSVG(w, cacheSeconds, card.RenderStatsCard(data, card.OptionsFromQuery(q)))
}

func handleTopLangs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	if username == "" {
		writeSVGError(w, "Missing username", "Use /api/top-langs?username=USERNAME")
		return
	}

	client, err := service.NewProvider(q.Get("platform"))
	if err != nil {
		writeSVGError(w, err.Error(), "Invalid platform")
		return
	}
	langs, err := client.FetchTopLanguages(r.Context(), username, parseCSV(q.Get("exclude_repo")), parseFloatDefault(q.Get("size_weight"), 1), parseFloatDefault(q.Get("count_weight"), 0))
	if err != nil {
		writeSVGError(w, err.Error(), service.PlatformDisplayName(q.Get("platform"))+" API request failed")
		return
	}

	cacheSeconds := resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["topLangs"])
	writeSVG(w, cacheSeconds, card.RenderTopLangsCard(langs, card.OptionsFromQuery(q), parseIntDefault(q.Get("langs_count"), 0), parseCSV(q.Get("hide"))))
}

func handlePin(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	repo := q.Get("repo")
	if username == "" || repo == "" {
		writeSVGError(w, "Missing username or repo", "Use /api/pin?username=USERNAME&repo=REPO")
		return
	}

	client, err := service.NewProvider(q.Get("platform"))
	if err != nil {
		writeSVGError(w, err.Error(), "Invalid platform")
		return
	}
	data, err := client.FetchRepo(r.Context(), username, repo)
	if err != nil {
		writeSVGError(w, err.Error(), service.PlatformDisplayName(q.Get("platform"))+" API request failed")
		return
	}

	cacheSeconds := resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["pin"])
	writeSVG(w, cacheSeconds, card.RenderRepoCard(data, card.OptionsFromQuery(q), parseBool(q.Get("show_owner"))))
}

func handleGist(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if service.NormalizePlatform(q.Get("platform")) == "cnb" {
		writeSVGError(w, "gist is not available for CNB", "Use a GitHub data source")
		return
	}
	id := q.Get("id")
	if id == "" {
		writeSVGError(w, "Missing gist id", "Use /api/gist?id=GIST_ID")
		return
	}

	client := service.NewClient()
	data, err := client.FetchGist(r.Context(), id)
	if err != nil {
		writeSVGError(w, err.Error(), "GitHub API request failed")
		return
	}

	cacheSeconds := resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["gist"])
	writeSVG(w, cacheSeconds, card.RenderGistCard(data, card.OptionsFromQuery(q), parseBool(q.Get("show_owner"))))
}

func handleWakatime(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	if username == "" {
		writeSVGError(w, "Missing username", "Use /api/wakatime?username=USERNAME")
		return
	}

	data, err := service.FetchWakatime(r.Context(), username, q.Get("api_domain"))
	if err != nil {
		writeSVGError(w, err.Error(), "WakaTime API request failed")
		return
	}

	cacheSeconds := resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["wakatime"])
	writeSVG(w, cacheSeconds, card.RenderWakatimeCard(data, card.OptionsFromQuery(q), parseIntDefault(q.Get("langs_count"), 5), parseCSV(q.Get("hide"))))
}

func handleStreak(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	if username == "" {
		writeSVGError(w, "Missing username", "Use /api/streak?username=USERNAME")
		return
	}
	client, err := service.NewProvider(q.Get("platform"))
	if err != nil {
		writeSVGError(w, err.Error(), "Invalid platform")
		return
	}
	name, days, err := client.FetchContributionCalendar(r.Context(), username)
	if err != nil {
		writeSVGError(w, err.Error(), service.PlatformDisplayName(q.Get("platform"))+" API request failed")
		return
	}
	writeSVG(w, resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["streak"]), card.RenderStreakCard(service.CalculateStreak(name, days), card.OptionsFromQuery(q)))
}

func handleProfileSummary(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	if username == "" {
		writeSVGError(w, "Missing username", "Use /api/profile-summary?username=USERNAME")
		return
	}
	client, err := service.NewProvider(q.Get("platform"))
	if err != nil {
		writeSVGError(w, err.Error(), "Invalid platform")
		return
	}
	data, err := client.FetchProfileSummary(r.Context(), username)
	if err != nil {
		writeSVGError(w, err.Error(), service.PlatformDisplayName(q.Get("platform"))+" API request failed")
		return
	}
	writeSVG(w, resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["profileSummary"]), card.RenderProfileSummaryCard(data, card.OptionsFromQuery(q)))
}

func handleContributionCalendar(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	if username == "" {
		writeSVGError(w, "Missing username", "Use /api/contribution-calendar?username=USERNAME")
		return
	}
	client, err := service.NewProvider(q.Get("platform"))
	if err != nil {
		writeSVGError(w, err.Error(), "Invalid platform")
		return
	}
	name, days, err := client.FetchContributionCalendar(r.Context(), username)
	if err != nil {
		writeSVGError(w, err.Error(), service.PlatformDisplayName(q.Get("platform"))+" API request failed")
		return
	}
	writeSVG(w, resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["contributionCalendar"]), card.RenderContributionCalendarCard(name, days, card.OptionsFromQuery(q)))
}

func handleRecentActivity(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username := q.Get("username")
	if username == "" {
		writeSVGError(w, "Missing username", "Use /api/recent-activity?username=USERNAME")
		return
	}
	client, err := service.NewProvider(q.Get("platform"))
	if err != nil {
		writeSVGError(w, err.Error(), "Invalid platform")
		return
	}
	items, err := client.FetchRecentActivity(r.Context(), username, parseIntDefault(q.Get("activity_count"), 5))
	if err != nil {
		writeSVGError(w, err.Error(), service.PlatformDisplayName(q.Get("platform"))+" API request failed")
		return
	}
	writeSVG(w, resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["recentActivity"]), card.RenderRecentActivityCard(username, items, card.OptionsFromQuery(q)))
}

func handleRepoLanguages(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	username, repo := q.Get("username"), q.Get("repo")
	if username == "" || repo == "" {
		writeSVGError(w, "Missing username or repo", "Use /api/repo-languages?username=USERNAME&repo=REPO")
		return
	}
	client, err := service.NewProvider(q.Get("platform"))
	if err != nil {
		writeSVGError(w, err.Error(), "Invalid platform")
		return
	}
	data, err := client.FetchRepoLanguages(r.Context(), username, repo, parseIntDefault(q.Get("langs_count"), 6))
	if err != nil {
		writeSVGError(w, err.Error(), service.PlatformDisplayName(q.Get("platform"))+" API request failed")
		return
	}
	writeSVG(w, resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["repoLanguages"]), card.RenderRepoLanguagesCard(data, card.OptionsFromQuery(q)))
}

func handleOrganization(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	org := q.Get("org")
	if org == "" {
		writeSVGError(w, "Missing organization", "Use /api/org?org=ORGANIZATION")
		return
	}
	client, err := service.NewProvider(q.Get("platform"))
	if err != nil {
		writeSVGError(w, err.Error(), "Invalid platform")
		return
	}
	data, err := client.FetchOrganization(r.Context(), org)
	if err != nil {
		writeSVGError(w, err.Error(), service.PlatformDisplayName(q.Get("platform"))+" API request failed")
		return
	}
	writeSVG(w, resolveCacheSeconds(q.Get("cache_seconds"), cachePolicies["organization"]), card.RenderOrganizationCard(data, card.OptionsFromQuery(q)))
}

func handleStatusUp(w http.ResponseWriter, r *http.Request) {
	platform := service.NormalizePlatform(r.URL.Query().Get("platform"))
	up := false
	if platform == "cnb" {
		up = service.NewCNBClient().HasUsableToken(r.Context())
	} else {
		up = service.NewClient().HasUsableToken(r.Context())
	}
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
	var info map[string]any
	if service.NormalizePlatform(r.URL.Query().Get("platform")) == "cnb" {
		info = service.NewCNBClient().TokenInfo(r.Context())
	} else {
		info = service.NewClient().PATInfo(r.Context())
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "max-age=0, s-maxage=300")
	_ = json.NewEncoder(w).Encode(info)
}

// maxAvatarSize is the upper bound for avatar images (2 MB).
// Any response larger than this is rejected to avoid OOM.
const maxAvatarSize = 2 << 20

func handleAvatarProxy(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	platform := r.URL.Query().Get("platform")

	if username == "" || platform == "" {
		http.Error(w, "Missing username or platform parameter", http.StatusBadRequest)
		return
	}

	// Validate inputs to prevent path traversal or abuse
	if platform != "github" && platform != "cnb" {
		http.Error(w, "Invalid platform parameter", http.StatusBadRequest)
		return
	}

	// Sanitize username (alphanumeric, dash, underscore, dot, plus, etc.)
	for _, ch := range username {
		if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.' || ch == '+') {
			http.Error(w, "Invalid characters in username", http.StatusBadRequest)
			return
		}
	}

	var fallbackURL string
	if platform == "github" {
		fallbackURL = "https://github.com/" + username + ".png"
	} else {
		fallbackURL = "https://cnb.cool/users/" + username + "/avatar/s"
	}

	var avatarURL string
	if platform == "github" {
		// Use API with a short 2-second timeout to avoid holding up the request
		apiCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		ghClient := service.NewClient()
		apiAvatarURL, err := ghClient.FetchAvatarURL(apiCtx, username)
		cancel()

		if err == nil && apiAvatarURL != "" {
			avatarURL = apiAvatarURL
		} else {
			avatarURL = fallbackURL
		}
	} else {
		avatarURL = fallbackURL
	}

	req, err := http.NewRequestWithContext(r.Context(), "GET", avatarURL, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header.Set("User-Agent", "EdgeOne-Stats-Agent/1.0")

	// Use a 5-second timeout for downloading the image, fallback to 302 on fail
	client := &http.Client{
		Timeout: 5 * time.Second,
	}
	resp, err := client.Do(req)
	if err != nil {
		// If back-to-source fails or times out, redirect the client to the direct avatar URL as fallback
		http.Redirect(w, r, fallbackURL, http.StatusFound)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Fallback to 302 redirect if the source returns a non-OK status code
		http.Redirect(w, r, fallbackURL, http.StatusFound)
		return
	}

	// --- Buffer-then-write: read the ENTIRE body before sending any bytes ---
	// This prevents the CDN from caching a truncated image when the upstream
	// transfer is interrupted mid-stream.
	expectedLen := int64(0)
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		expectedLen, _ = strconv.ParseInt(cl, 10, 64)
	}

	// Guard against absurdly large payloads
	if expectedLen > maxAvatarSize {
		http.Redirect(w, r, fallbackURL, http.StatusFound)
		return
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxAvatarSize+1))
	if err != nil {
		// Read failed (timeout, connection reset, etc.) → redirect as fallback
		http.Redirect(w, r, fallbackURL, http.StatusFound)
		return
	}

	// Reject over-sized responses that exceeded the limit reader
	if int64(len(body)) > maxAvatarSize {
		http.Redirect(w, r, fallbackURL, http.StatusFound)
		return
	}

	// If the upstream declared a Content-Length, verify we received exactly that many bytes.
	// A mismatch means the transfer was truncated.
	if expectedLen > 0 && int64(len(body)) != expectedLen {
		http.Redirect(w, r, fallbackURL, http.StatusFound)
		return
	}

	// --- All data received and validated. Now write the response atomically. ---
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")

	contentType := resp.Header.Get("Content-Type")
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	} else {
		w.Header().Set("Content-Type", "image/png")
	}

	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(body)))
	w.Header().Set("Cache-Control", "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400")

	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(body))
}
