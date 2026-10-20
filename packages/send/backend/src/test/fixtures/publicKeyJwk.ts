// Exactly what the client sends today:
// JSON.stringify(await crypto.subtle.exportKey('jwk', rsaOaepPublicKey)).
export const CLIENT_JWK =
  '{"key_ops":["wrapKey"],"ext":true,"alg":"RSA-OAEP-256","kty":"RSA","n":"za6Pb4lz_H_KB3NB42fPKTZGxITHiq1sTePypTf9jjlH9Nr1iUdzcNHhsAtHhcvtX0mUgLd9noIoZiWIV_TedD5PoRyKUPEEtLw6H7dLvhtKoJnlDpT_epmrmTG961LCBc1t1L2JdLQd6vMsAlLsY23rndHkRuPy1XdzIfn8ay-HbTOX1Uli04PNDE7SukNSUejbOIhNG-LazyEYJbZBMBdLOMC83pxmLYUblWFVEwPvFzUWxxy-ss1hlNGzVSx_--OsQWWIUNJdfwQv1Agh36BqP_a5FsuxC4bmZm-rHb6gHzSO69UQyYldMmsQ-W1fvcGvbE1n5RPdZP4L_ZL2NQ","e":"AQAB"}';
