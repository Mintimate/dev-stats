package handler

import (
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

func TestHandlerUnknownRoute(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/unknown", nil)

	Handler(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", recorder.Code)
	}
}
