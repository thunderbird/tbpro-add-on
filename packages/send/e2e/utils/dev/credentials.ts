import config from "dotenv";
import path from "path";

// CI writes the OIDC provider's credentials to this file (see the "Run stack and
// test" step in .github/workflows/e2e-test.yml). Locally it does not exist, and the
// only spec that needs them skips itself.
config.config({
  path: path.resolve(__dirname, "../../tests/desktop/dev/.env"),
});

export const credentials = {
  TBPRO_USERNAME: process.env.TBPRO_USERNAME,
  TBPRO_PASSWORD: process.env.TBPRO_PASSWORD,
};
