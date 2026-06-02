// Renders editor-style folder icons for the project file tree.
import type { ReactElement } from "react";
import folderApiIconUrl from "@/assets/file-icons/folder-api.svg";
import folderApiOpenIconUrl from "@/assets/file-icons/folder-api-open.svg";
import folderAppIconUrl from "@/assets/file-icons/folder-app.svg";
import folderAppOpenIconUrl from "@/assets/file-icons/folder-app-open.svg";
import folderAudioIconUrl from "@/assets/file-icons/folder-audio.svg";
import folderAudioOpenIconUrl from "@/assets/file-icons/folder-audio-open.svg";
import folderBaseOpenIconUrl from "@/assets/file-icons/folder-base-open.svg";
import folderComponentsIconUrl from "@/assets/file-icons/folder-components.svg";
import folderComponentsOpenIconUrl from "@/assets/file-icons/folder-components-open.svg";
import folderConfigIconUrl from "@/assets/file-icons/folder-config.svg";
import folderConfigOpenIconUrl from "@/assets/file-icons/folder-config-open.svg";
import folderDatabaseIconUrl from "@/assets/file-icons/folder-database.svg";
import folderDatabaseOpenIconUrl from "@/assets/file-icons/folder-database-open.svg";
import folderDefaultIconUrl from "@/assets/file-icons/folder.svg";
import folderDistIconUrl from "@/assets/file-icons/folder-dist.svg";
import folderDistOpenIconUrl from "@/assets/file-icons/folder-dist-open.svg";
import folderDocsIconUrl from "@/assets/file-icons/folder-docs.svg";
import folderDocsOpenIconUrl from "@/assets/file-icons/folder-docs-open.svg";
import folderGitIconUrl from "@/assets/file-icons/folder-git.svg";
import folderGitOpenIconUrl from "@/assets/file-icons/folder-git-open.svg";
import folderGithubIconUrl from "@/assets/file-icons/folder-github.svg";
import folderGithubOpenIconUrl from "@/assets/file-icons/folder-github-open.svg";
import folderImagesIconUrl from "@/assets/file-icons/folder-images.svg";
import folderImagesOpenIconUrl from "@/assets/file-icons/folder-images-open.svg";
import folderNodeIconUrl from "@/assets/file-icons/folder-node.svg";
import folderNodeOpenIconUrl from "@/assets/file-icons/folder-node-open.svg";
import folderPublicIconUrl from "@/assets/file-icons/folder-public.svg";
import folderPublicOpenIconUrl from "@/assets/file-icons/folder-public-open.svg";
import folderRoutesIconUrl from "@/assets/file-icons/folder-routes.svg";
import folderRoutesOpenIconUrl from "@/assets/file-icons/folder-routes-open.svg";
import folderScriptsIconUrl from "@/assets/file-icons/folder-scripts.svg";
import folderScriptsOpenIconUrl from "@/assets/file-icons/folder-scripts-open.svg";
import folderSrcIconUrl from "@/assets/file-icons/folder-src.svg";
import folderSrcOpenIconUrl from "@/assets/file-icons/folder-src-open.svg";
import folderTestIconUrl from "@/assets/file-icons/folder-test.svg";
import folderTestOpenIconUrl from "@/assets/file-icons/folder-test-open.svg";
import folderUtilsIconUrl from "@/assets/file-icons/folder-utils.svg";
import folderUtilsOpenIconUrl from "@/assets/file-icons/folder-utils-open.svg";
import folderVideoIconUrl from "@/assets/file-icons/folder-video.svg";
import folderVideoOpenIconUrl from "@/assets/file-icons/folder-video-open.svg";
import folderVscodeIconUrl from "@/assets/file-icons/folder-vscode.svg";
import folderVscodeOpenIconUrl from "@/assets/file-icons/folder-vscode-open.svg";
import { getProjectFolderIconKind, type ProjectFolderIconKind } from "@/state/projectFolderIcons";

type ProjectFolderIconProps = {
  className?: string;
  expanded: boolean;
  relativePath: string;
};

const FOLDER_ICON_URL_BY_KIND: Record<ProjectFolderIconKind, { closed: string; open: string }> = {
  api: { closed: folderApiIconUrl, open: folderApiOpenIconUrl },
  app: { closed: folderAppIconUrl, open: folderAppOpenIconUrl },
  audio: { closed: folderAudioIconUrl, open: folderAudioOpenIconUrl },
  components: { closed: folderComponentsIconUrl, open: folderComponentsOpenIconUrl },
  config: { closed: folderConfigIconUrl, open: folderConfigOpenIconUrl },
  database: { closed: folderDatabaseIconUrl, open: folderDatabaseOpenIconUrl },
  default: { closed: folderDefaultIconUrl, open: folderBaseOpenIconUrl },
  dist: { closed: folderDistIconUrl, open: folderDistOpenIconUrl },
  docs: { closed: folderDocsIconUrl, open: folderDocsOpenIconUrl },
  git: { closed: folderGitIconUrl, open: folderGitOpenIconUrl },
  github: { closed: folderGithubIconUrl, open: folderGithubOpenIconUrl },
  images: { closed: folderImagesIconUrl, open: folderImagesOpenIconUrl },
  node: { closed: folderNodeIconUrl, open: folderNodeOpenIconUrl },
  public: { closed: folderPublicIconUrl, open: folderPublicOpenIconUrl },
  routes: { closed: folderRoutesIconUrl, open: folderRoutesOpenIconUrl },
  scripts: { closed: folderScriptsIconUrl, open: folderScriptsOpenIconUrl },
  src: { closed: folderSrcIconUrl, open: folderSrcOpenIconUrl },
  test: { closed: folderTestIconUrl, open: folderTestOpenIconUrl },
  utils: { closed: folderUtilsIconUrl, open: folderUtilsOpenIconUrl },
  video: { closed: folderVideoIconUrl, open: folderVideoOpenIconUrl },
  vscode: { closed: folderVscodeIconUrl, open: folderVscodeOpenIconUrl }
};

export function ProjectFolderIcon({
  className = "h-3.5 w-3.5 shrink-0",
  expanded,
  relativePath
}: ProjectFolderIconProps): ReactElement {
  const kind = getProjectFolderIconKind(relativePath);
  const iconUrls = FOLDER_ICON_URL_BY_KIND[kind];

  return (
    <img
      aria-hidden="true"
      alt=""
      className={`${className} object-contain`}
      draggable={false}
      src={expanded ? iconUrls.open : iconUrls.closed}
    />
  );
}
