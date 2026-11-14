package card

import (
	"encoding/xml"
	"io"
	"strings"
	"testing"
	"time"

	"dev-stats/cloud-functions/internal/service"
)

func TestRenderStarHistoryCard(t *testing.T) {
	date := time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC)
	tests := []struct {
		name   string
		data   service.StarHistoryData
		query  map[string][]string
		output []string
	}{
		{
			name:  "no history",
			data:  service.StarHistoryData{FullName: "Mintimate/oh-my-rime"},
			query: map[string][]string{"theme": {"catppuccin_latte"}},
			output: []string{
				`fill="#eff1f5"`, "Mintimate/oh-my-rime Star History", "No stars yet",
			},
		},
		{
			name: "one day",
			data: service.StarHistoryData{
				FullName:   "Mintimate/oh-my-rime",
				TotalStars: 1,
				Points:     []service.StarHistoryPoint{{Date: date, Count: 1}},
			},
			query: map[string][]string{"theme": {"catppuccin_mocha"}, "custom_title": {"& <stars>"}},
			output: []string{
				`fill="#1e1e2e"`, "&amp; &lt;stars&gt;", "Oct 1, 2026", `>1 star</text>`, "<circle ",
			},
		},
		{
			name: "flat curve",
			data: service.StarHistoryData{
				FullName: "Mintimate/oh-my-rime",
				Points:   []service.StarHistoryPoint{{Date: date, Count: 0}, {Date: date.AddDate(0, 0, 2), Count: 0}},
			},
			query: map[string][]string{"card_width": {"540"}, "hide_title": {"true"}, "show_icons": {"true"}},
			output: []string{
				`width="540"`, `d="M64.0 242.0L514.0 242.0"`, `class="icon"`, `>0 stars</text>`,
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svg := RenderStarHistoryCard(tt.data, OptionsFromQuery(tt.query))
			for _, want := range tt.output {
				if !strings.Contains(svg, want) {
					t.Errorf("card is missing %q", want)
				}
			}
			if strings.Contains(svg, "NaN") || strings.Contains(svg, "Inf") {
				t.Fatal("card contains a non-finite coordinate")
			}
			decoder := xml.NewDecoder(strings.NewReader(svg))
			for {
				_, err := decoder.Token()
				if err == io.EOF {
					break
				}
				if err != nil {
					t.Fatalf("card is not valid SVG XML: %v", err)
				}
			}
		})
	}
}
