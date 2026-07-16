package handler

import (
	"encoding/json"
	"net/http"
	"strings"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" && r.URL.Query().Get("username") == "" {
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
	case "/streak":
		handleStreak(w, r)
	case "/profile-summary":
		handleProfileSummary(w, r)
	case "/contribution-calendar":
		handleContributionCalendar(w, r)
	case "/recent-activity":
		handleRecentActivity(w, r)
	case "/repo-languages":
		handleRepoLanguages(w, r)
	case "/org":
		handleOrganization(w, r)
	case "/status/up":
		handleStatusUp(w, r)
	case "/status/pat-info":
		handlePATInfo(w, r)
	case "/avatar":
		handleAvatarProxy(w, r)
	case "/auth/tdp/start":
		handleTDPOIDCStart(w, r)
	case "/auth/tdp/status":
		handleTDPOIDCStatus(w, r)
	case "/auth/tdp/callback":
		handleTDPOIDCCallback(w, r)
	case "/auth/tdp/identity":
		handleTDPOIDCIdentity(w, r)
	default:
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
	}
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
