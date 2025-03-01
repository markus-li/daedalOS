import {
  BASE_WEBAMP_OPTIONS,
  cleanBufferOnSkinLoad,
  closeEqualizer,
  createM3uPlaylist,
  enabledMilkdrop,
  getMetadataProvider,
  getWebampElement,
  loadButterchurnPreset,
  loadMilkdropWhenNeeded,
  MAIN_WINDOW,
  parseTrack,
  PLAYLIST_WINDOW,
  tracksFromPlaylist,
  updateWebampPosition,
} from "components/apps/Webamp/functions";
import type { WebampCI } from "components/apps/Webamp/types";
import useFileDrop from "components/system/Files/FileManager/useFileDrop";
import type { CompleteAction } from "components/system/Files/FileManager/useFolder";
import useWindowActions from "components/system/Window/Titlebar/useWindowActions";
import { useFileSystem } from "contexts/fileSystem";
import { useProcesses } from "contexts/process";
import processDirectory from "contexts/process/directory";
import { useSession } from "contexts/session";
import { extname } from "path";
import { useCallback, useRef } from "react";
import { useTheme } from "styled-components";
import {
  AUDIO_PLAYLIST_EXTENSIONS,
  DESKTOP_PATH,
  MILLISECONDS_IN_SECOND,
  TRANSITIONS_IN_MILLISECONDS,
} from "utils/constants";
import { haltEvent } from "utils/functions";
import type { Options, Track, URLTrack } from "webamp";

type Webamp = {
  initWebamp: (containerElement: HTMLDivElement, options: Options) => void;
  webampCI?: WebampCI;
};

const useWebamp = (id: string): Webamp => {
  const { onClose, onMinimize } = useWindowActions(id);
  const { setWindowStates, windowStates: { [id]: windowState } = {} } =
    useSession();
  const { position } = windowState || {};
  const {
    sizes: {
      taskbar: { height: taskbarHeight },
    },
  } = useTheme();
  const {
    linkElement,
    processes: { [id]: process },
    title,
  } = useProcesses();
  const { componentWindow } = process || {};
  const webampCI = useRef<WebampCI>();
  const { createPath, readFile, updateFolder } = useFileSystem();
  const { onDrop: onDropCopy } = useFileDrop({ id });
  const { onDrop } = useFileDrop({
    callback: async (
      fileName: string,
      buffer?: Buffer,
      completeAction?: CompleteAction
    ) => {
      if (webampCI.current) {
        const data = buffer || (await readFile(fileName));
        const track = await parseTrack(data, fileName);

        if (completeAction !== "updateUrl") {
          webampCI.current.appendTracks([track]);
        }
      }
    },
    id,
  });
  const metadataProviderRef = useRef<number>();
  const initWebamp = useCallback(
    (
      containerElement: HTMLDivElement,
      { initialSkin, initialTracks }: Options
    ) => {
      const handleUrl = async (): Promise<Track[]> => {
        // eslint-disable-next-line no-alert
        const externalUrl = prompt(
          "Enter an Internet location to open here:\nFor example: https://server.com/playlist.m3u"
        );

        if (externalUrl) {
          const playlistExtension = extname(externalUrl).toLowerCase();

          if (AUDIO_PLAYLIST_EXTENSIONS.has(playlistExtension)) {
            return tracksFromPlaylist(
              await (await fetch(externalUrl)).text(),
              playlistExtension
            );
          }

          return [
            {
              duration: 0,
              url: externalUrl,
            },
          ];
        }

        return [];
      };
      const webamp = new window.Webamp({
        ...BASE_WEBAMP_OPTIONS,
        handleAddUrlEvent: handleUrl,
        handleLoadListEvent: handleUrl,
        handleSaveListEvent: (tracks: URLTrack[]) => {
          createPath(
            "playlist.m3u",
            DESKTOP_PATH,
            Buffer.from(createM3uPlaylist(tracks))
          ).then((saveName) => updateFolder(DESKTOP_PATH, saveName));
        },
        initialSkin,
        initialTracks,
      } as Options) as WebampCI;
      const setupElements = (): void => {
        const webampElement = getWebampElement();

        if (webampElement) {
          const mainWindow =
            webampElement.querySelector<HTMLDivElement>(MAIN_WINDOW);
          const playlistWindow =
            webampElement.querySelector<HTMLDivElement>(PLAYLIST_WINDOW);

          [mainWindow, playlistWindow].forEach((element) => {
            element?.addEventListener("drop", (event) => {
              onDropCopy(event);
              onDrop(event);
            });
            element?.addEventListener("dragover", haltEvent);
          });

          if (process && !componentWindow && mainWindow) {
            linkElement(id, "componentWindow", containerElement);
            linkElement(id, "peekElement", mainWindow);
          }

          containerElement.appendChild(webampElement);
        }
      };
      const subscriptions = [
        webamp.onWillClose((cancel) => {
          cancel();

          const mainWindow =
            getWebampElement()?.querySelector<HTMLDivElement>(MAIN_WINDOW);
          const { x = 0, y = 0 } = mainWindow?.getBoundingClientRect() || {};

          onClose();
          setWindowStates((currentWindowStates) => ({
            ...currentWindowStates,
            [id]: {
              position: { x, y },
            },
          }));

          window.setTimeout(() => {
            subscriptions.forEach((unsubscribe) => unsubscribe());
            webamp.close();
          }, TRANSITIONS_IN_MILLISECONDS.WINDOW);
        }),
        webamp.onMinimize(() => onMinimize()),
        webamp.onTrackDidChange((track) => {
          const { milkdrop, windows } = webamp.store.getState();

          if (windows?.genWindows?.milkdrop?.open && milkdrop?.butterchurn) {
            loadButterchurnPreset(webamp);
          }

          window.clearInterval(metadataProviderRef.current);

          if (track?.url) {
            const getMetadata = getMetadataProvider(track.url);

            if (getMetadata) {
              const updateTrackInfo = async (): Promise<void> => {
                const { playlist: { currentTrack = -1 } = {}, tracks } =
                  webamp.store.getState() || {};

                if (tracks[currentTrack]) {
                  const metaData = await getMetadata?.();

                  if (metaData) {
                    webamp.store.dispatch({
                      type: "SET_MEDIA_TAGS",
                      ...tracks[currentTrack],
                      ...metaData,
                    });
                    title(id, `${metaData.artist} - ${metaData.title}`);
                  }
                }
              };

              updateTrackInfo();
              metadataProviderRef.current = window.setInterval(
                updateTrackInfo,
                30 * MILLISECONDS_IN_SECOND
              );
            } else {
              const { playlist: { currentTrack = -1 } = {}, tracks } =
                webamp.store.getState() || {};

              if (tracks[currentTrack]) {
                const { artist, title: trackTitle } = tracks[currentTrack];

                title(id, `${artist} - ${trackTitle}`);
              }
            }
          } else {
            title(id, processDirectory["Webamp"].title);
          }
        }),
      ];

      if (initialSkin) cleanBufferOnSkinLoad(webamp, initialSkin.url);

      webamp.renderWhenReady(containerElement).then(() => {
        closeEqualizer(webamp);
        enabledMilkdrop(webamp);
        loadMilkdropWhenNeeded(webamp);
        updateWebampPosition(webamp, taskbarHeight, position);
        setupElements();

        if (initialTracks) webamp.play();
      });

      webampCI.current = webamp;
    },
    [
      componentWindow,
      createPath,
      id,
      linkElement,
      onClose,
      onDrop,
      onDropCopy,
      onMinimize,
      position,
      process,
      setWindowStates,
      taskbarHeight,
      title,
      updateFolder,
    ]
  );

  return {
    initWebamp,
    webampCI: webampCI.current,
  };
};

export default useWebamp;
