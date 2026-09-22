# Nasri LINE Bot Deployment & Business Rules Documentation

## Business Rules & Technical Specifications

1. **ATMOCE Micro Inverter Systems**:
   - **Default Micro Ratio**: 2:1 (1 micro inverter per 2 solar panels).
   - **Trunk Cable Default**: 2.5 meters.
   - **C&I Threshold**: System capacity ≥ 30 kW (or explicit C&I keywords like `โรงงาน`, `c&i`) automatically selects C&I micro inverter system (MI-1250).
   - **Ratio Quick Reply**: If a user requests an ATMOCE system without specifying ratio (and it's not AC coupling or C&I), the bot returns a Quick Reply prompt asking to choose between 2:1 (recommended) and 1:1.
   - **AC Coupling**: Requests specifying `ac coupling` or `atmoce_ac` calculate battery and ESS components directly without asking for panel ratio.

2. **Environment Variables**:
   - `SURVEY_BASE_URL`: Base REST API URL for Survey catalog (default: `https://survey.enervia.co.th/wp-json/leadfollow/v1`).
   - `LF_SURVEY_API_KEY`: API Key for Survey catalog pricelist authentication (`X-LF-Api-Key`).
   - `LF_BOM_FIXTURE_MODE`: Set to `1` (or `true`) to run offline using local fixture JSON data (`pricelist_fixture.json`, `qpkg_fixture.json`).

3. **Deployment Procedure**:
   - Deploy script: `scripts/deploy.sh` (v3.1).
   - Base expected branch for live deployment verification: `DEPLOY_EXPECT_LIVE=live/ai-enervia-current`.
   - Command:
     ```bash
     DEPLOY_EXPECT_LIVE=live/ai-enervia-current bash scripts/deploy.sh
     ```

---
*Nasri Oracle — Right Hand of Ma'at 𓂀*
