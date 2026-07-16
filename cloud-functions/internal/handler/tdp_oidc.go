package handler

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

const (
	tdpOIDCDefaultIssuer = "https://tdp.fan/oidc"
	tdpOIDCFlowCookie    = "devstats_tdp_oidc_flow"
	tdpOIDCResultCookie  = "devstats_tdp_identity"
	tdpOIDCCookiePath    = "/api/auth/tdp"
	tdpOIDCFlowTTL       = 10 * time.Minute
	tdpOIDCResultTTL     = 5 * time.Minute
)

type tdpOIDCConfig struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	CookieSecret string
	RedirectURI  string
	SecureCookie bool
}

type tdpOIDCFlow struct {
	State        string `json:"state"`
	Nonce        string `json:"nonce"`
	CodeVerifier string `json:"code_verifier"`
	ReturnTo     string `json:"return_to"`
	ExpiresAt    int64  `json:"expires_at"`
}

type tdpIdentity struct {
	Platform string `json:"platform"`
	Username string `json:"username"`
}

type tdpIdentityResult struct {
	Identities []tdpIdentity `json:"identities"`
	ExpiresAt  int64         `json:"expires_at"`
}

type tdpOIDCIdentityAudit struct {
	Event          string `json:"event"`
	Subject        string `json:"subject"`
	GitHubUsername string `json:"github_username,omitempty"`
	CNBUsername    string `json:"cnb_username,omitempty"`
	IdentityCount  int    `json:"identity_count"`
}

func handleTDPOIDCStatus(w http.ResponseWriter, r *http.Request) {
	setNoStoreHeaders(w)
	if r.Method != http.MethodGet {
		writeJSONStatus(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
		return
	}
	writeJSONStatus(w, http.StatusOK, map[string]any{"configured": isTDPOIDCConfigured()})
}

func handleTDPOIDCStart(w http.ResponseWriter, r *http.Request) {
	setNoStoreHeaders(w)
	if r.Method != http.MethodGet {
		writeJSONStatus(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
		return
	}

	config, err := loadTDPOIDCConfig(r)
	if err != nil {
		log.Printf("TDP OIDC start configuration error: %v", err)
		writeJSONStatus(w, http.StatusServiceUnavailable, map[string]any{"error": "TDP account import is not configured"})
		return
	}
	// A new import invalidates any unconsumed result from an earlier attempt.
	clearTDPCookie(w, tdpOIDCResultCookie, config.SecureCookie)

	provider, err := discoverTDPOIDCProvider(r.Context(), config.Issuer)
	if err != nil {
		log.Printf("TDP OIDC discovery failed: %v", err)
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{"error": "TDP authorization is temporarily unavailable"})
		return
	}

	state, err := randomURLSafeString(32)
	if err != nil {
		writeJSONStatus(w, http.StatusInternalServerError, map[string]any{"error": "failed to initialize authorization"})
		return
	}
	nonce, err := randomURLSafeString(32)
	if err != nil {
		writeJSONStatus(w, http.StatusInternalServerError, map[string]any{"error": "failed to initialize authorization"})
		return
	}
	verifier, err := randomURLSafeString(32)
	if err != nil {
		writeJSONStatus(w, http.StatusInternalServerError, map[string]any{"error": "failed to initialize authorization"})
		return
	}

	flow := tdpOIDCFlow{
		State:        state,
		Nonce:        nonce,
		CodeVerifier: verifier,
		ReturnTo:     sanitizeLocalReturnTo(r.URL.Query().Get("return_to")),
		ExpiresAt:    time.Now().Add(tdpOIDCFlowTTL).Unix(),
	}
	encodedFlow, err := encodeSignedValue(config.CookieSecret, flow)
	if err != nil {
		writeJSONStatus(w, http.StatusInternalServerError, map[string]any{"error": "failed to initialize authorization"})
		return
	}
	setTDPCookie(w, tdpOIDCFlowCookie, encodedFlow, tdpOIDCFlowTTL, config.SecureCookie)

	oauthConfig := newTDPOAuthConfig(provider, config)
	authorizationURL := oauthConfig.AuthCodeURL(
		state,
		oauth2.S256ChallengeOption(verifier),
		oauth2.SetAuthURLParam("nonce", nonce),
	)
	http.Redirect(w, r, authorizationURL, http.StatusFound)
}

func handleTDPOIDCCallback(w http.ResponseWriter, r *http.Request) {
	setNoStoreHeaders(w)
	if r.Method != http.MethodGet {
		writeJSONStatus(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
		return
	}

	config, err := loadTDPOIDCConfig(r)
	if err != nil {
		log.Printf("TDP OIDC callback configuration error: %v", err)
		writeJSONStatus(w, http.StatusServiceUnavailable, map[string]any{"error": "TDP account import is not configured"})
		return
	}
	clearTDPCookie(w, tdpOIDCFlowCookie, config.SecureCookie)

	flowCookie, err := r.Cookie(tdpOIDCFlowCookie)
	if err != nil {
		redirectTDPOIDCResult(w, r, "/", "error")
		return
	}
	var flow tdpOIDCFlow
	if err := decodeSignedValue(config.CookieSecret, flowCookie.Value, &flow); err != nil || flow.ExpiresAt < time.Now().Unix() {
		redirectTDPOIDCResult(w, r, "/", "error")
		return
	}

	if providerError := r.URL.Query().Get("error"); providerError != "" {
		log.Printf("TDP OIDC authorization rejected: %q", providerError)
		redirectTDPOIDCResult(w, r, flow.ReturnTo, "cancelled")
		return
	}
	if !hmac.Equal([]byte(flow.State), []byte(r.URL.Query().Get("state"))) || r.URL.Query().Get("code") == "" {
		redirectTDPOIDCResult(w, r, flow.ReturnTo, "error")
		return
	}

	provider, err := discoverTDPOIDCProvider(r.Context(), config.Issuer)
	if err != nil {
		log.Printf("TDP OIDC callback discovery failed: %v", err)
		redirectTDPOIDCResult(w, r, flow.ReturnTo, "error")
		return
	}
	oauthConfig := newTDPOAuthConfig(provider, config)
	token, err := oauthConfig.Exchange(r.Context(), r.URL.Query().Get("code"), oauth2.VerifierOption(flow.CodeVerifier))
	if err != nil {
		log.Printf("TDP OIDC token exchange failed: %v", err)
		redirectTDPOIDCResult(w, r, flow.ReturnTo, "error")
		return
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		log.Print("TDP OIDC token response did not include an ID token")
		redirectTDPOIDCResult(w, r, flow.ReturnTo, "error")
		return
	}
	verifiedIDToken, err := provider.Verifier(&oidc.Config{ClientID: config.ClientID}).Verify(r.Context(), rawIDToken)
	if err != nil {
		log.Printf("TDP OIDC ID token verification failed: %v", err)
		redirectTDPOIDCResult(w, r, flow.ReturnTo, "error")
		return
	}
	var idClaims map[string]any
	if err := verifiedIDToken.Claims(&idClaims); err != nil || !hmac.Equal([]byte(flow.Nonce), []byte(claimString(idClaims["nonce"]))) {
		log.Print("TDP OIDC nonce verification failed")
		redirectTDPOIDCResult(w, r, flow.ReturnTo, "error")
		return
	}

	userInfo, err := provider.UserInfo(r.Context(), oauth2.StaticTokenSource(token))
	if err != nil {
		log.Printf("TDP OIDC userinfo request failed: %v", err)
		redirectTDPOIDCResult(w, r, flow.ReturnTo, "error")
		return
	}
	if userInfo.Subject == "" || userInfo.Subject != verifiedIDToken.Subject {
		log.Print("TDP OIDC userinfo subject did not match the ID token")
		redirectTDPOIDCResult(w, r, flow.ReturnTo, "error")
		return
	}

	var userClaims map[string]any
	if err := userInfo.Claims(&userClaims); err != nil {
		log.Printf("TDP OIDC userinfo claims could not be decoded: %v", err)
		redirectTDPOIDCResult(w, r, flow.ReturnTo, "error")
		return
	}
	identities := extractTDPIdentities(userClaims)
	logTDPOIDCIdentityImport(userInfo.Subject, identities)
	result := tdpIdentityResult{
		Identities: identities,
		ExpiresAt:  time.Now().Add(tdpOIDCResultTTL).Unix(),
	}
	encodedResult, err := encodeSignedValue(config.CookieSecret, result)
	if err != nil {
		redirectTDPOIDCResult(w, r, flow.ReturnTo, "error")
		return
	}
	setTDPCookie(w, tdpOIDCResultCookie, encodedResult, tdpOIDCResultTTL, config.SecureCookie)
	redirectTDPOIDCResult(w, r, flow.ReturnTo, "success")
}

func handleTDPOIDCIdentity(w http.ResponseWriter, r *http.Request) {
	setNoStoreHeaders(w)
	if r.Method != http.MethodGet {
		writeJSONStatus(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
		return
	}

	config, err := loadTDPOIDCConfig(r)
	if err != nil {
		writeJSONStatus(w, http.StatusServiceUnavailable, map[string]any{"error": "TDP account import is not configured"})
		return
	}
	clearTDPCookie(w, tdpOIDCResultCookie, config.SecureCookie)

	resultCookie, err := r.Cookie(tdpOIDCResultCookie)
	if err != nil {
		writeJSONStatus(w, http.StatusUnauthorized, map[string]any{"error": "TDP identity result is unavailable or already consumed"})
		return
	}
	var result tdpIdentityResult
	if err := decodeSignedValue(config.CookieSecret, resultCookie.Value, &result); err != nil || result.ExpiresAt < time.Now().Unix() {
		writeJSONStatus(w, http.StatusUnauthorized, map[string]any{"error": "TDP identity result has expired"})
		return
	}
	if result.Identities == nil {
		result.Identities = []tdpIdentity{}
	}
	writeJSONStatus(w, http.StatusOK, map[string]any{"identities": result.Identities})
}

func loadTDPOIDCConfig(r *http.Request) (tdpOIDCConfig, error) {
	issuer := strings.TrimRight(strings.TrimSpace(os.Getenv("TDP_OIDC_ISSUER")), "/")
	if issuer == "" {
		issuer = tdpOIDCDefaultIssuer
	}
	clientID := strings.TrimSpace(os.Getenv("TDP_OIDC_CLIENT_ID"))
	clientSecret := strings.TrimSpace(os.Getenv("TDP_OIDC_CLIENT_SECRET"))
	cookieSecret := strings.TrimSpace(os.Getenv("TDP_OIDC_COOKIE_SECRET"))
	if clientID == "" || clientSecret == "" || len(cookieSecret) < 32 {
		return tdpOIDCConfig{}, errors.New("TDP_OIDC_CLIENT_ID, TDP_OIDC_CLIENT_SECRET and a 32+ character TDP_OIDC_COOKIE_SECRET are required")
	}

	redirectURI := strings.TrimSpace(os.Getenv("TDP_OIDC_REDIRECT_URI"))
	if redirectURI == "" {
		origin := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_SITE_URL")), "/")
		if origin == "" {
			origin = requestOrigin(r)
		}
		redirectURI = origin + "/api/auth/tdp/callback"
	}
	parsedIssuer, err := url.Parse(issuer)
	if err != nil || parsedIssuer.Host == "" || (parsedIssuer.Scheme != "https" && !isLoopbackHost(parsedIssuer.Hostname())) {
		return tdpOIDCConfig{}, errors.New("TDP_OIDC_ISSUER must be an HTTPS URL")
	}
	parsedRedirect, err := url.Parse(redirectURI)
	if err != nil || parsedRedirect.Host == "" || (parsedRedirect.Scheme != "https" && !isLoopbackHost(parsedRedirect.Hostname())) {
		return tdpOIDCConfig{}, errors.New("TDP_OIDC_REDIRECT_URI must be HTTPS, except on localhost")
	}

	return tdpOIDCConfig{
		Issuer:       issuer,
		ClientID:     clientID,
		ClientSecret: clientSecret,
		CookieSecret: cookieSecret,
		RedirectURI:  redirectURI,
		SecureCookie: parsedRedirect.Scheme == "https",
	}, nil
}

func isTDPOIDCConfigured() bool {
	return strings.TrimSpace(os.Getenv("TDP_OIDC_CLIENT_ID")) != "" &&
		strings.TrimSpace(os.Getenv("TDP_OIDC_CLIENT_SECRET")) != "" &&
		len(strings.TrimSpace(os.Getenv("TDP_OIDC_COOKIE_SECRET"))) >= 32
}

func discoverTDPOIDCProvider(ctx context.Context, issuer string) (*oidc.Provider, error) {
	// The provider owns a RemoteKeySet that retains this context. Keep it scoped
	// to one HTTP request instead of caching a provider created from a request
	// context that will be cancelled after the response completes.
	return oidc.NewProvider(ctx, issuer)
}

func newTDPOAuthConfig(provider *oidc.Provider, config tdpOIDCConfig) oauth2.Config {
	endpoint := provider.Endpoint()
	endpoint.AuthStyle = oauth2.AuthStyleInHeader
	return oauth2.Config{
		ClientID:     config.ClientID,
		ClientSecret: config.ClientSecret,
		Endpoint:     endpoint,
		RedirectURL:  config.RedirectURI,
		Scopes:       []string{oidc.ScopeOpenID, "tdp:social"},
	}
}

func extractTDPIdentities(claims map[string]any) []tdpIdentity {
	social, ok := claims["tdp_social"].(map[string]any)
	if !ok {
		return []tdpIdentity{}
	}
	identities := make([]tdpIdentity, 0, 2)
	if username := claimString(social["github_username"]); username != "" {
		identities = append(identities, tdpIdentity{
			Platform: "github",
			Username: username,
		})
	}
	if username := claimString(social["cnb_username"]); username != "" {
		identities = append(identities, tdpIdentity{
			Platform: "cnb",
			Username: username,
		})
	}
	return identities
}

func logTDPOIDCIdentityImport(subject string, identities []tdpIdentity) {
	audit := tdpOIDCIdentityAudit{
		Event:         "identity_import",
		Subject:       subject,
		IdentityCount: len(identities),
	}
	for _, identity := range identities {
		switch identity.Platform {
		case "github":
			audit.GitHubUsername = identity.Username
		case "cnb":
			audit.CNBUsername = identity.Username
		}
	}
	encoded, err := json.Marshal(audit)
	if err != nil {
		log.Print("TDP OIDC identity import audit could not be encoded")
		return
	}
	log.Printf("TDP OIDC identity import: %s", encoded)
}

func claimString(value any) string {
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

func encodeSignedValue(secret string, value any) (string, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(payload)
	signature := signTDPPayload(secret, encodedPayload)
	return encodedPayload + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func decodeSignedValue(secret, encoded string, destination any) error {
	parts := strings.Split(encoded, ".")
	if len(parts) != 2 {
		return errors.New("invalid signed value")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(signature, signTDPPayload(secret, parts[0])) {
		return errors.New("invalid signed value signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return errors.New("invalid signed value payload")
	}
	if err := json.Unmarshal(payload, destination); err != nil {
		return errors.New("invalid signed value JSON")
	}
	return nil
}

func signTDPPayload(secret, payload string) []byte {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte("devstats/tdp-identity/v1\x00"))
	_, _ = mac.Write([]byte(payload))
	return mac.Sum(nil)
}

func randomURLSafeString(bytesLength int) (string, error) {
	value := make([]byte, bytesLength)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func sanitizeLocalReturnTo(raw string) string {
	if raw == "" {
		return "/#agent"
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.IsAbs() || parsed.Host != "" || !strings.HasPrefix(parsed.Path, "/") || strings.HasPrefix(parsed.Path, "//") {
		return "/#agent"
	}
	return parsed.String()
}

func redirectTDPOIDCResult(w http.ResponseWriter, r *http.Request, returnTo, status string) {
	parsed, err := url.Parse(sanitizeLocalReturnTo(returnTo))
	if err != nil {
		parsed = &url.URL{Path: "/", Fragment: "agent"}
	}
	query := parsed.Query()
	query.Set("tdp_oidc", status)
	parsed.RawQuery = query.Encode()
	http.Redirect(w, r, parsed.String(), http.StatusFound)
}

func setTDPCookie(w http.ResponseWriter, name, value string, ttl time.Duration, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     tdpOIDCCookiePath,
		MaxAge:   int(ttl.Seconds()),
		Expires:  time.Now().Add(ttl),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearTDPCookie(w http.ResponseWriter, name string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     tdpOIDCCookiePath,
		MaxAge:   -1,
		Expires:  time.Unix(1, 0),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func setNoStoreHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
}

func writeJSONStatus(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func requestOrigin(r *http.Request) string {
	protocol := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0])
	if protocol == "" {
		if r.TLS != nil {
			protocol = "https"
		} else {
			protocol = "http"
		}
	}
	host := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Host"), ",")[0])
	if host == "" {
		host = r.Host
	}
	return protocol + "://" + host
}

func isLoopbackHost(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}
