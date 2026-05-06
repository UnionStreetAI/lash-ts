# Release Checklist

1. Confirm `package.json` has the intended version.
2. Run checks:

   ```sh
   npm ci
   npm run check
   npm audit
   npm pack --dry-run
   ```

3. Publish:

   ```sh
   npm publish --access public
   ```

4. Tag the release:

   ```sh
   git tag v0.1.0
   git push origin main --tags
   ```
