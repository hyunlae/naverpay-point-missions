# Execution Checklist

1. Open the mission page with persisted state and complete login manually.
2. Run discovery and inspect the generated mission list:
   - Remove items that are not safe to auto-click.
   - Keep only obvious mission-action rows.
   - Verify each mission `waitSeconds` is reasonable.
3. Run mission script from the reviewed JSON in a small batch (`--missions ... --max 2`).
4. Confirm point accrual on NaverPay page.
5. Increase batch size only after successful verification.
6. Re-run discovery whenever mission labels/cards change.
7. Keep completed-campaign store and verify completed missions are skipped next run.
8. Use `--live-discovery true` only when you intentionally want unattended live execution.
