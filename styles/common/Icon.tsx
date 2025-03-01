import { memo, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { cleanUpBufferUrl, imageSrc, imageSrcs } from "utils/functions";

export type IconProps = {
  $displaySize?: number;
  $eager?: boolean;
  $imgRef?: React.MutableRefObject<HTMLImageElement | null>;
  $imgSize: number;
  $moving?: boolean;
};

type StyledIconProps = Pick<IconProps, "$eager" | "$moving"> & {
  $height: number;
  $offset: number | string;
  $width: number;
};

const StyledIcon = styled.img
  .withConfig({
    shouldForwardProp: (prop, defaultValidatorFn) =>
      ["fetchpriority"].includes(prop) || defaultValidatorFn(prop),
  })
  .attrs<StyledIconProps>(({ $eager = false, $height, $width }) => ({
    decoding: "async",
    draggable: false,
    fetchpriority: $eager ? "high" : undefined,
    height: $height,
    loading: $eager ? "eager" : undefined,
    width: $width,
  }))<StyledIconProps>`
  aspect-ratio: 1;
  left: ${({ $offset }) => $offset};
  max-height: ${({ $height }) => `${$height}px`};
  max-width: ${({ $width }) => `${$width}px`};
  min-height: ${({ $height }) => `${$height}px`};
  min-width: ${({ $width }) => `${$width}px`};
  object-fit: contain;
  opacity: ${({ $moving }) => ($moving ? 0.5 : 1)};
  top: ${({ $offset }) => $offset};
`;

const SUPPORTED_PIXEL_RATIOS = [3, 2, 1];

const Icon: FC<IconProps & React.ImgHTMLAttributes<HTMLImageElement>> = (
  props
) => {
  const [loaded, setLoaded] = useState(false);
  const {
    $displaySize = 0,
    $imgRef,
    $imgSize = 0,
    src = "",
    ...componentProps
  } = props;
  const style = useMemo<React.CSSProperties>(
    () => ({ visibility: loaded ? "visible" : "hidden" }),
    [loaded]
  );
  const isStaticIcon =
    !src ||
    src.startsWith("blob:") ||
    src.startsWith("http:") ||
    src.startsWith("https:") ||
    src.startsWith("data:") ||
    src.endsWith(".ico");
  const dimensionProps = useMemo(() => {
    const size = $displaySize > $imgSize ? $imgSize : $displaySize || $imgSize;
    const $offset =
      $displaySize > $imgSize ? `${$displaySize - $imgSize}px` : 0;

    return {
      $height: size,
      $offset,
      $width: size,
    };
  }, [$displaySize, $imgSize]);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);

  useEffect(
    () => () => {
      if (loaded && src.startsWith("blob:")) cleanUpBufferUrl(src);
    },
    [loaded, src]
  );

  const RenderedIcon = (
    <StyledIcon
      ref={$imgRef}
      onError={() => {
        const { currentSrc = "" } = $imgRef?.current || {};

        if (currentSrc && !failedUrls.includes(currentSrc)) {
          const { pathname } = new URL(currentSrc);

          setFailedUrls((currentFailedUrls) => [
            ...currentFailedUrls,
            pathname,
          ]);
        }
      }}
      onLoad={() => setLoaded(true)}
      src={isStaticIcon ? src : imageSrc(src, $imgSize, 1, ".png")}
      srcSet={
        !isStaticIcon ? imageSrcs(src, $imgSize, ".png", failedUrls) : undefined
      }
      style={style}
      {...componentProps}
      {...dimensionProps}
    />
  );

  return (
    <picture>
      {!isStaticIcon &&
        SUPPORTED_PIXEL_RATIOS.map((ratio) => {
          const srcSet = imageSrc(src, $imgSize, ratio, ".webp");
          const mediaRatio = ratio - 0.99;

          if (
            failedUrls.length > 0 &&
            failedUrls.includes(srcSet.split(" ")[0])
          ) {
            return;
          }

          // eslint-disable-next-line consistent-return
          return (
            <source
              key={ratio}
              media={
                ratio > 1
                  ? `(min-resolution: ${mediaRatio}x), (-webkit-min-device-pixel-ratio: ${mediaRatio})`
                  : undefined
              }
              srcSet={srcSet}
              type="image/webp"
            />
          );
        })}
      {RenderedIcon}
    </picture>
  );
};

export default memo(Icon);
