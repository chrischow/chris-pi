/**
 * Custom welcome banner that renders as a styled component in the session view.
 */

import fs from "node:fs";
import path from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";

function readBannerLines(): string[] {
  const bannerPath = path.join(__dirname, "banner.txt");
  try {
    return fs.readFileSync(bannerPath, "utf8").split(/\r?\n/);
  } catch {
    return ["Welcome to Pi!" + bannerPath];
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerMessageRenderer(
    "welcome-message",
    (_message, _expanded, theme) => {
      // Main container
      const container = new Container();

      // Banner
      const bannerLines = readBannerLines();
      bannerLines.forEach((bannerLine) => {
        container.addChild(new Text(theme.fg("accent", bannerLine), 1, 0));
      });

      return container;
    },
  );

  pi.on("session_start", async () => {
    pi.sendMessage({
      customType: "welcome-message",
      content: "Welcome to Pi!",
      display: true,
    });
  });
}