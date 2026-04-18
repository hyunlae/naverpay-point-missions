# Execution Checklist

1. Open the mission page with persisted state and complete login manually.
   - With `--headless true`, the first run may briefly open a visible browser for this login step, then continue headless with the same `--state-dir`.
2. Run discovery and inspect the generated mission list:
   - Remove items that are not safe to auto-click.
   - Keep only obvious mission-action rows.
   - Verify each mission `waitSeconds` is reasonable.
3. Reuse the same `--state-dir` for the reviewed run so the saved session is preserved.
4. Run mission script from the reviewed JSON in a small batch (`--missions ... --max 2`).
5. Confirm point accrual on NaverPay page.
6. Increase batch size only after successful verification.
7. Re-run discovery whenever mission labels/cards change.
8. Keep completed-campaign store and verify completed missions are skipped next run.
9. Use `--live-discovery true` only when you intentionally want unattended live execution.
