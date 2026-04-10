/**
 * Keycloak client config (Item 2: SSO Login)
 *
 * Install the library first:
 *   npm install keycloak-js
 *
 * Then set these values to match your Keycloak server.
 * With Vite you can use import.meta.env.VITE_KEYCLOAK_* variables
 * from a .env file instead of hardcoding them here.
 */
import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url:      import.meta.env.VITE_KEYCLOAK_URL      ?? "https://your-keycloak-server/auth",
  realm:    import.meta.env.VITE_KEYCLOAK_REALM    ?? "your-realm",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT   ?? "idp-agent-ui",
});

export default keycloak;
