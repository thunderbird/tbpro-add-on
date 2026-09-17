/**
 * Local-only stand-in for Keycloak's token introspection endpoint, for manually
 * testing the internal service-auth endpoints (#1247).
 *
 * It exists because no client in the shared dev/stage realm can issue a
 * client-credentials token: the backend's own client is not enabled for service
 * accounts, and the frontend's client has direct access grants turned off. So
 * there is no way to exercise the authorized branches of `requireServiceAuth`
 * against the real realm without an admin provisioning a service-account
 * client first.
 *
 * Point the backend at this instead and each token below stands for one case:
 *
 *   OIDC_TOKEN_INTROSPECTION_URL=http://host.docker.internal:9998/introspect
 *
 * Never run this anywhere but a local machine — it hands out "this token is
 * valid" for fixed strings.
 */
import express from 'express';

const PORT = 9998;

/** Each key is a Bearer token you can send; the value is Keycloak's verdict. */
const VERDICTS: Record<string, Record<string, unknown>> = {
  'tok-allowlisted': { active: true, client_id: 'accounts-backend' },
  // Some client-credentials setups report the caller in `azp`, not `client_id`.
  'tok-azp-only': { active: true, azp: 'accounts-backend' },
  'tok-other-client': { active: true, client_id: 'some-other-client' },
  // Active, but Keycloak named no client at all.
  'tok-no-client': { active: true },
  'tok-inactive': { active: false },
};

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/introspect', (req, res) => {
  const token = String(req.body.token ?? '');

  // Stands in for Keycloak being down, so the guard's 503 path is reachable.
  if (token === 'tok-unreachable') {
    return res.status(500).json({ error: 'server_error' });
  }

  const verdict = VERDICTS[token] ?? { active: false };
  console.log(`introspect ${token || '(empty)'} -> ${JSON.stringify(verdict)}`);
  return res.json(verdict);
});

app.listen(PORT, () => {
  console.log(`Introspection stub listening on http://localhost:${PORT}`);
  console.log(`Tokens: ${Object.keys(VERDICTS).join(', ')}, tok-unreachable`);
});
