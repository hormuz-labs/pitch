export async function openStudioProject(
  projectId: string,
  navigate: (path: string) => void,
  studioRouteReady: Promise<unknown>,
) {
  await studioRouteReady
  navigate(`/p/${projectId}`)
}
