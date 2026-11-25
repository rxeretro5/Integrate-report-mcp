---
name: integrate-report-mcp
description: Build or extend an application with the user's GitHub-hosted Report Assistant MCP as an embedded reporting component. Use for requests to reuse this MCP Server for Thai or English questions, clarification and read-only reports in a new or existing app.
---

# Integrate Report Assistant MCP

Build the requested host application and wire its actual report screen or command to the upstream server. Keep the app's existing language, UI and data-access conventions.

## Obtain the upstream

Use https://github.com/rxeretro5/Integrate-report-mcp.git as the default source. Use a different credential-free GitHub clone URL only if the user explicitly specifies it. Use existing Git authentication if the source requires it.

On every invocation, clone from the GitHub URL into a fresh temporary directory. Use the default branch HEAD from that clone, or check out the revision explicitly requested by the user. Do not source MCP files from an existing local checkout, the Downloads folder, or a previous integration. If cloning or revision resolution fails, report the error and pause the MCP integration. Record the fetched GitHub URL and exact commit in the host project. Inspect the fetched README, package.json, settings.example.json, server.js and client.js to confirm the supported contract.

Use the host project's dependency mechanism if suitable. For a standalone app, copy the pinned runtime (currently package.json, server.js, assistant.js and the required adapter files) into an app-owned component directory, preserving relative paths and upstream license notices. Include these files in the app's build and distribution. Keep application settings, catalog and adapter customizations outside the vendored files. Preserve existing customizations on repeated invocation.

## Connect the app

- Launch the server from the app as a stdio child process with an absolute entrypoint, using the Node version declared upstream. Resolve paths from the installed app, including when launched from another working directory. For Windows packaging, bundle the runtime or document Node as a prerequisite.
- Pass REPORT_SETTINGS as an absolute path. Resolve adapter, catalog and database paths relative to that settings file. Keep the selected OpenRouter model in app settings and pass the API key from the host's secret settings or environment. Keep the app's existing user permissions on the data connection.
- Build reports from the target app's manual, schema and relationships. For SQLite use parameterized catalog queries; for other data sources implement the open/manual/reports/run/close contract from the pinned adapter. Use synthetic fixtures for development if a real schema is unavailable, and identify that limitation.
- Use an MCP client compatible with the pinned server. Initialize, send notifications/initialized, discover tools, and route report questions to report_ask. Preserve sessionId across clarification turns within one user's report, render question or explanation directly, and render filters and rows from structuredContent. Handle isError, server exit and shutdown. Keep returned rows local. The user's messages and manual are sent to OpenRouter.
- Provide the requested program through its normal entry point. Verify that the app can launch the packaged component and execute a deterministic report_run against a synthetic fixture with the expected result. Exercise report_ask and a clarification turn using a mock or an authorized configured provider. State which path was tested and where the user can set the model and key.
