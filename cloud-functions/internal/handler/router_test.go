package handler

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandlerMissingUsername(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api", nil)

	Handler(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}
	if contentType := recorder.Header().Get("Content-Type"); !strings.HasPrefix(contentType, "image/svg+xml") {
		t.Fatalf("expected SVG response, got %q", contentType)
	}
	if !strings.Contains(recorder.Body.String(), "Missing username") {
		t.Fatal("missing-username error card was not rendered")
	}
}

func TestWakatimeRouteRejectsUnapprovedUpstream(t *testing.T) {
	t.Setenv("WAKATIME_API_DOMAINS", "")
	w := httptest.NewRecorder()
	Handler(w, httptest.NewRequest(http.MethodGet, "/api/wakatime?username=example&api_domain=unapproved.example", nil))
	if !strings.Contains(w.Body.String(), "WakaTime API domain is not allowed") {
		t.Fatal("the request should fail before contacting an unapproved domain")
	}
}

func TestAvatarResponseUsesDetectedRasterType(t *testing.T) {
	const fallback = "https://cnb.cool/users/example/avatar/s"
	for _, tc := range []struct {
		name string
		body string
		want int
	}{
		{"raster", "\x89PNG\r\n\x1a\n", http.StatusOK},
		{"html", "<html>Unexpected upstream page</html>", http.StatusFound},
		{"svg", `<svg xmlns="http://www.w3.org/2000/svg"/>`, http.StatusFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp := &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(tc.body)), Header: http.Header{"Content-Type": {"text/html"}}}
			w := httptest.NewRecorder()
			serveAvatarResponse(w, httptest.NewRequest(http.MethodGet, "/api/avatar", nil), resp, fallback)
			if w.Code != tc.want {
				t.Fatalf("status %d, want %d", w.Code, tc.want)
			}
			if tc.want == http.StatusFound {
				if w.Header().Get("Location") != fallback || strings.Contains(w.Body.String(), tc.body) {
					t.Fatal("unexpected upstream data was served instead of using the avatar fallback")
				}
			} else if w.Header().Get("Content-Type") != "image/png" || w.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatalf("unexpected avatar headers: %v", w.Header())
			}
		})
	}
}

func TestHandlerUnknownRoute(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/unknown", nil)

	Handler(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", recorder.Code)
	}
}

func TestStarHistoryRouteRejectsInvalidRequests(t *testing.T) {
	for _, test := range []struct {
		name  string
		query string
		want  string
	}{
		{"missing repository", "username=Mintimate", "Missing username or repo"},
		{"unsupported platform", "platform=cnb&username=Mintimate&repo=oh-my-rime", "Use platform=github"},
		{"path in repository", "username=Mintimate&repo=other%2Frepo", "Invalid repository"},
		{"parent directory", "username=Mintimate&repo=..", "Invalid repository"},
	} {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			Handler(recorder, httptest.NewRequest(http.MethodGet, "/api/star-history?"+test.query, nil))

			if recorder.Code != http.StatusOK || !strings.HasPrefix(recorder.Header().Get("Content-Type"), "image/svg+xml") {
				t.Fatalf("expected an SVG error card, got status %d and content type %q", recorder.Code, recorder.Header().Get("Content-Type"))
			}
			if !strings.Contains(recorder.Body.String(), test.want) {
				t.Fatalf("missing error message %q", test.want)
			}
			if !strings.Contains(recorder.Header().Get("Cache-Control"), "no-store") {
				t.Fatalf("error SVG should be non-cacheable, got %q", recorder.Header().Get("Cache-Control"))
			}
		})
	}
}

func TestStarHistoryRouteRejectsUnsupportedMethod(t *testing.T) {
	recorder := httptest.NewRecorder()
	Handler(recorder, httptest.NewRequest(http.MethodPost, "/api/star-history?username=Mintimate&repo=oh-my-rime", nil))

	if recorder.Code != http.StatusMethodNotAllowed || recorder.Header().Get("Allow") != "GET, HEAD" {
		t.Fatalf("expected 405 with GET and HEAD allowed, got %d and %q", recorder.Code, recorder.Header().Get("Allow"))
	}
}
