/** Inside a run, Settings and End Run wait in the HUD's menu: opens it if
 * it is shut (in the forest, which has no menu, does nothing). */
export async function openMenu(page) {
  const toggle = page.locator("#run-menu-toggle");
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}
