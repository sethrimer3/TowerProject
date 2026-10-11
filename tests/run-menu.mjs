/** Settings, Missions and the rest wait in the HUD's menu, in the forest
 * and inside a run: opens it if it is shut. */
export async function openMenu(page) {
  const toggle = page.locator("#run-menu-toggle");
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}
