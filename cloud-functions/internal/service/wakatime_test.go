package service

import (
	"net/http"
	"net/url"
	"testing"
)

func TestWakatimeStatsURLUsesApprovedHostsAndEscapesUsername(t *testing.T) {
	t.Setenv("WAKATIME_API_DOMAINS", "custom.example")
	for domain, wantHost := range map[string]string{
		"": wakatimeAPIHost, "wakatime.com/": wakatimeAPIHost, "api.wakatime.com": wakatimeAPIHost, "custom.example": "custom.example",
	} {
		target, err := wakatimeStatsURL("alice?preview", domain)
		if err != nil {
			t.Fatal(err)
		}
		parsed, err := url.Parse(target)
		if err != nil || parsed.Scheme != "https" || parsed.Host != wantHost || parsed.EscapedPath() != "/api/v1/users/alice%3Fpreview/stats" || parsed.RawQuery != "is_including_today=true" {
			t.Fatalf("domain %q produced unexpected URL %q", domain, target)
		}
	}
	for _, domain := range []string{"other.example", "custom.example:443", "custom.example/path"} {
		if _, err := wakatimeStatsURL("alice", domain); err == nil {
			t.Fatalf("accepted unexpected API domain %q", domain)
		}
	}
	if err := wakatimeClient.CheckRedirect(nil, nil); err != http.ErrUseLastResponse {
		t.Fatal("the WakaTime client must not follow upstream redirects")
	}
}
