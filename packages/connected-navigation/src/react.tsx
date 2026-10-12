import { renderConnectedNavigation, type ConnectedNavigationProps } from "./html";

export function ConnectedNavigation(props: ConnectedNavigationProps) {
  return <div dangerouslySetInnerHTML={{ __html: renderConnectedNavigation(props) }} />;
}
