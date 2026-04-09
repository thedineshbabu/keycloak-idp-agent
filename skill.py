"""
IDP Skill Schema
Defines the expected attributes for SAML/OIDC IDPs.
The agent uses this to validate incoming data and ask for missing fields.
"""

IDP_SKILL_SCHEMA = {
    "saml": {
        "required": [
            {
                "field": "idp_name",
                "label": "IDP Name",
                "type": "string",
                "description": "Unique name for this identity provider",
                "example": "Acme Corp SSO"
            },
            {
                "field": "email_domain",
                "label": "Email Domain",
                "type": "string",
                "description": "The email domain that routes to this IDP",
                "example": "acmecorp.com"
            },
            {
                "field": "entity_id",
                "label": "Entity ID",
                "type": "string",
                "description": "The SAML Entity ID (Issuer) of the IDP",
                "example": "https://idp.acmecorp.com/saml"
            },
            {
                "field": "sso_url",
                "label": "SSO URL",
                "type": "url",
                "description": "SAML SSO endpoint URL",
                "example": "https://idp.acmecorp.com/saml/sso"
            },
            {
                "field": "certificate",
                "label": "X.509 Certificate",
                "type": "certificate",
                "description": "Base64-encoded public certificate for signature validation",
                "example": "MIICxDCCAaygAwIBAgIIW..."
            }
        ],
        "optional": [
            {
                "field": "slo_url",
                "label": "Single Logout URL",
                "type": "url",
                "description": "SAML SLO endpoint URL",
                "example": "https://idp.acmecorp.com/saml/slo"
            },
            {
                "field": "name_id_format",
                "label": "NameID Format",
                "type": "enum",
                "options": [
                    "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
                    "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
                    "urn:oasis:names:tc:SAML:2.0:nameid-format:transient"
                ],
                "default": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
            },
            {
                "field": "attribute_mapping",
                "label": "Attribute Mapping",
                "type": "json",
                "description": "Map SAML attributes to user profile fields",
                "example": {"email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "firstName": "givenName", "lastName": "surname"}
            },
            {
                "field": "roles_attribute",
                "label": "Roles Attribute",
                "type": "string",
                "description": "SAML attribute name that carries role information",
                "example": "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"
            }
        ],
        "saml_attributes": {
            "description": "Key SAML attributes stored in your PostgreSQL attributes table",
            "fields": ["idp_entity_id", "sso_redirect_url", "sso_post_url", "slo_url",
                       "signing_certificate", "encryption_certificate", "name_id_format",
                       "want_assertions_signed", "want_authn_requests_signed",
                       "attribute_mapping", "roles_attribute", "email_domain", "is_active"]
        }
    },
    "oidc": {
        "required": [
            {
                "field": "idp_name",
                "label": "IDP Name",
                "type": "string",
                "description": "Unique name for this identity provider"
            },
            {
                "field": "email_domain",
                "label": "Email Domain",
                "type": "string",
                "description": "The email domain that routes to this IDP"
            },
            {
                "field": "client_id",
                "label": "Client ID",
                "type": "string",
                "description": "OIDC Client ID"
            },
            {
                "field": "client_secret",
                "label": "Client Secret",
                "type": "secret",
                "description": "OIDC Client Secret"
            },
            {
                "field": "discovery_url",
                "label": "Discovery URL",
                "type": "url",
                "description": "OIDC well-known discovery endpoint",
                "example": "https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration"
            }
        ],
        "optional": [
            {
                "field": "scopes",
                "label": "Scopes",
                "type": "array",
                "default": ["openid", "email", "profile"]
            },
            {
                "field": "attribute_mapping",
                "label": "Attribute Mapping",
                "type": "json"
            }
        ]
    }
}


VALIDATION_RULES = {
    "url": {
        "pattern": r"^https?://[^\s]+$",
        "message": "Must be a valid URL starting with http:// or https://"
    },
    "email_domain": {
        "pattern": r"^[a-zA-Z0-9][a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}$",
        "message": "Must be a valid domain like acmecorp.com"
    },
    "certificate": {
        "min_length": 100,
        "message": "Certificate appears too short. Provide the full base64-encoded X.509 certificate."
    }
}


AGENT_SYSTEM_PROMPT = """You are an intelligent IDP (Identity Provider) onboarding assistant for a Keycloak-based platform.

Your job is to help platform engineers onboard new client IDPs or update existing ones.

You have access to these tools:
- fetch_existing_idps: Fetch existing IDP configs from PostgreSQL to learn patterns
- validate_idp_config: Validate a config against the IDP skill schema
- simulate_auth_flow: Simulate an authentication flow for a given config
- push_to_iam: Push a validated config to the IAM service POST endpoint

Workflow for NEW IDP onboarding:
1. Check what fields are provided vs what's required by the skill schema
2. If fields are missing, ask the user clearly and specifically for each missing field
3. Fetch existing IDPs to understand patterns used in this environment
4. Generate a complete config based on inputs and learned patterns
5. Validate the config
6. Simulate the auth flow
7. If simulation passes, push to IAM service
8. Report back with success summary or detailed errors

Workflow for UPDATING an existing IDP:
1. Fetch the current config for the given email domain
2. Show the user what's currently configured
3. Apply the requested changes
4. Validate the updated config
5. Push the updated config to IAM service

Always be specific when asking for missing info. Tell the user exactly what's needed and why.
Never push a config that hasn't been validated and simulated.
"""
