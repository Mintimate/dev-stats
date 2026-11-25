package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"slices"
	"strings"
	"time"
)

const (
	wakatimeAPIHost = "api.wakatime.com"
	maxWakatimeBody = 2 << 20
)

var (
	wakatimeHostname = regexp.MustCompile(`^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
	wakatimeClient   = &http.Client{
		Timeout: 12 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
)

func wakatimeStatsURL(username, apiDomain string) (string, error) {
	if username == "" || username == "." || username == ".." || strings.ContainsAny(username, `/\`) {
		return "", errors.New("invalid WakaTime username")
	}
	host := strings.ToLower(strings.TrimRight(strings.TrimSpace(apiDomain), "/"))
	switch host {
	case "", "wakatime.com", wakatimeAPIHost:
		host = wakatimeAPIHost
	default:
		allowed := strings.ToLower(os.Getenv("WAKATIME_API_DOMAINS"))
		if !wakatimeHostname.MatchString(host) || !slices.Contains(parseCSV(allowed), host) {
			return "", errors.New("WakaTime API domain is not allowed")
		}
	}
	return "https://" + host + "/api/v1/users/" + url.PathEscape(username) + "/stats?is_including_today=true", nil
}

func FetchWakatime(ctx context.Context, username, apiDomain string) ([]WakatimeLanguage, error) {
	target, err := wakatimeStatsURL(username, apiDomain)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	response, err := wakatimeClient.Do(request)
	if err != nil {
		return nil, errors.New("could not reach the WakaTime API")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return nil, fmt.Errorf("could not resolve WakaTime user %q", username)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxWakatimeBody+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxWakatimeBody {
		return nil, errors.New("WakaTime API response is too large")
	}
	var payload struct {
		Data struct {
			Languages []WakatimeLanguage `json:"languages"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	return payload.Data.Languages, nil
}
