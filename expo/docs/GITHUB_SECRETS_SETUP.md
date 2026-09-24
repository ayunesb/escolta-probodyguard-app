# GitHub Secrets Configuration Guide

## Overview
This guide walks you through setting up GitHub repository secrets for the Escolta Pro app's CI/CD pipeline.

## Required Secrets

### 1. Firebase Configuration Secrets

Navigate to **Settings > Secrets and variables > Actions** in your GitHub repository and add:

```
EXPO_PUBLIC_FIREBASE_API_KEY
```
**Value:** `AIzaSyAjjsRChFfCQi3piUdtiUCqyysFrh2Cdes`
**Description:** Firebase Web API key for authentication and services

```
EXPO_PUBLIC_FIREBASE_PROJECT_ID
```
**Value:** `escolta-pro-fe90e`
**Description:** Firebase project identifier

```
EXPO_PUBLIC_API_URL
```
**Value:** `https://handlepaymentwebhook-fqzvp2js5q-uc.a.run.app`
**Description:** Cloud Functions endpoint URL

```
FIREBASE_TOKEN
```
**Value:** _[Generate using `firebase login:ci`]_
**Description:** CI/CD deployment token for Firebase

### 2. Braintree Payment Secrets

```
BRAINTREE_MERCHANT_ID
```
**Value (Sandbox):** `8jbpcm9yj7df7w4h`
**Value (Production):** _[Your production merchant ID]_
**Description:** Braintree merchant identifier

```
BRAINTREE_PUBLIC_KEY
```
**Value (Sandbox):** `sandbox_p2dkbpfh_8jbpcm9yj7df7w4h`
**Value (Production):** _[Your production public key]_
**Description:** Braintree public key for client-side operations

```
BRAINTREE_PRIVATE_KEY
```
**Value (Sandbox):** `REDACTED`
**Value (Production):** _[Your production private key]_
**Description:** Braintree private key for server-side operations

### 3. Expo/EAS Secrets

```
EXPO_TOKEN
```
**Value:** _[Generate from https://expo.dev/accounts/settings/access-tokens]_
**Description:** Expo access token for EAS builds and deployments

## Step-by-Step Setup Instructions

### Step 1: Generate Firebase CI Token
```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login and generate CI token
firebase login:ci
```
Copy the generated token and add it as `FIREBASE_TOKEN` secret.

### Step 2: Generate Expo Access Token
1. Go to [Expo Access Tokens](https://expo.dev/accounts/settings/access-tokens)
2. Click "Create Token"
3. Name it "GitHub Actions CI/CD"
4. Copy the token and add it as `EXPO_TOKEN` secret

### Step 3: Add Environment Variables
1. Go to your GitHub repository
2. Navigate to **Settings > Secrets and variables > Actions**
3. Click **"New repository secret"** for each secret above
4. Enter the **Name** and **Value** exactly as specified

### Step 4: Verify Secrets Configuration
After adding all secrets, run this command to test:

```bash
# This will trigger the environment check in CI/CD
git commit --allow-empty -m "Test GitHub secrets configuration"
git push origin main
```

Check the **Actions** tab to see if the "Environment Check" job passes.

## Security Best Practices

### Secret Management
- ✅ Never commit secrets to version control
- ✅ Use different keys for development and production
- ✅ Rotate tokens regularly (every 90 days)
- ✅ Limit token permissions to minimum required

### Production vs Development
- **Development:** Use sandbox Braintree keys
- **Production:** Use live Braintree keys (add when ready for production)
- **Staging:** Consider separate Firebase project for staging

### Monitoring Access
- Monitor secret usage in GitHub Actions logs
- Set up alerts for failed authentication
- Regularly audit who has access to repository secrets

## Troubleshooting

### Common Issues

**1. Firebase Token Expired**
```bash
# Generate new token
firebase login:ci
# Update FIREBASE_TOKEN secret in GitHub
```

**2. Expo Token Invalid**
- Generate new token from Expo dashboard
- Ensure token has correct permissions
- Update EXPO_TOKEN secret

**3. Environment Check Fails**
- Verify all secret names match exactly (case-sensitive)
- Check that all required secrets are added
- Ensure secret values don't have extra spaces

**4. Braintree Authentication Fails**
- Verify merchant ID, public key, and private key match
- Ensure using correct environment (sandbox vs production)
- Check Braintree account status

### Validation Commands

Test secrets locally (development only):
```bash
# Load environment and test
node scripts/checkEnv.js

# Test Braintree connection
cd functions && node test-client-token.js
```

## Production Deployment Checklist

- [ ] All Firebase secrets configured
- [ ] All Braintree secrets configured (production keys when ready)
- [ ] Expo token configured with build permissions
- [ ] Firebase CI token has deployment permissions
- [ ] Environment check passes in GitHub Actions
- [ ] All team members have appropriate repository access
- [ ] Backup of all production secrets stored securely

## Next Steps

After configuring secrets:
1. Test the CI/CD pipeline with a pull request
2. Verify deployment to Firebase works
3. Test EAS builds trigger correctly
4. Monitor first production deployment
5. Set up secret rotation schedule

## Emergency Procedures

If secrets are compromised:
1. **Immediately revoke** compromised tokens/keys
2. **Generate new** credentials
3. **Update GitHub secrets** with new values
4. **Test pipeline** to ensure functionality
5. **Audit access logs** to understand breach scope
6. **Document incident** and update security procedures