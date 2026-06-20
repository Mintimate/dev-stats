package card

import (
	"strings"
	"testing"
)

func TestSVGUsesSharedStyleOnce(t *testing.T) {
	opts := OptionsFromQuery(map[string][]string{"theme": {"dark"}})
	svg := SVG(320, 120, opts, "Title", "<text>Body</text>", "")

	if count := strings.Count(svg, "<style>"); count != 1 {
		t.Fatalf("expected one shared style block, got %d", count)
	}
	if !strings.Contains(svg, ".rank-circle-rim") {
		t.Fatal("shared card styles are missing")
	}
	if !strings.Contains(svg, "#151515") {
		t.Fatal("selected theme background was not applied")
	}
}
