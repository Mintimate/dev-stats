package handler

import (
	"crypto/sha1"
	"fmt"
	"html"
	"net/http"
	"os"
	"strconv"
	"strings"

	"dev-stats/cloud-functions/internal/card"
)

func writeSVG(w http.ResponseWriter, cacheSeconds int, svg string) {
	w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if os.Getenv("NODE_ENV") == "development" || cacheSeconds < 1 {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0, s-maxage=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
	} else {
		w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, s-maxage=%d, stale-while-revalidate=86400", cacheSeconds, cacheSeconds))
	}
	w.Header().Set("ETag", weakETag(svg))
	_, _ = w.Write([]byte(svg))
}

func writeSVGError(w http.ResponseWriter, message, secondary string) {
	writeSVG(w, errorCacheSeconds, card.SVG(576, 120, card.OptionsFromQuery(map[string][]string{}), "Something went wrong!", fmt.Sprintf(`<text x="25" y="66" class="label">%s</text><text x="25" y="88" class="muted">%s</text>`, html.EscapeString(message), html.EscapeString(secondary)), ""))
}

func weakETag(body string) string { sum := sha1.Sum([]byte(body)); return fmt.Sprintf(`W/"%x"`, sum) }
func resolveCacheSeconds(raw string, policy cachePolicy) int {
	value := policy.Default
	if parsed, err := strconv.Atoi(raw); err == nil {
		value = parsed
	}
	if env := os.Getenv("CACHE_SECONDS"); env != "" {
		if parsed, err := strconv.Atoi(env); err == nil {
			value = parsed
		}
	}
	if value < policy.Min {
		return policy.Min
	}
	if value > policy.Max {
		return policy.Max
	}
	return value
}
func parseBool(raw string) bool {
	switch strings.ToLower(raw) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
func parseCSV(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}
func parseIntDefault(raw string, fallback int) int {
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}
func parseFloatDefault(raw string, fallback float64) float64 {
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return fallback
	}
	return value
}
