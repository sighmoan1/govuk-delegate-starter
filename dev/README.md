# Development keys (not secret, not for production)

- `oidc-client-private.pem`: the One Login simulator's published default test key.
- `test-agent-private.pem` / `test-agent.jwks.json`: a Web Bot Auth key for a pretend agent,
  `https://test-agent.local`, so automated tests can sign requests the way ChatGPT agent does.
  Trusted only outside public mode.
