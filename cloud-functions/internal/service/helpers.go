package service

import (
	"crypto/sha1"
	"strings"
)

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

func defaultColor(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func colorForName(name string) string {
	palette := []string{"#3572A5", "#f1e05a", "#2b7489", "#00ADD8", "#dea584", "#89e051", "#701516", "#4F5D95"}
	sum := sha1.Sum([]byte(name))
	return palette[int(sum[0])%len(palette)]
}

func setFromStrings(values []string) map[string]bool {
	set := make(map[string]bool, len(values))
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			set[value], set[strings.ToLower(value)] = true, true
		}
	}
	return set
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
