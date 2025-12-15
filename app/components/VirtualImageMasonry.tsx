'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ImageFile } from '../types';
import ImageCard from './ImageCard';

const GUTTER_PX = 16;

function getLaneCount(containerWidth: number): number {
  if (containerWidth <= 640) return 1;
  if (containerWidth <= 768) return 2;
  if (containerWidth <= 1024) return 3;
  return 4;
}

function getColumnWidth(containerWidth: number, lanes: number): number {
  const safeLanes = Math.max(1, lanes);
  const totalGutter = GUTTER_PX * (safeLanes - 1);
  const width = Math.floor((containerWidth - totalGutter) / safeLanes);
  return Math.max(1, width);
}

function estimateCardHeight(orientation: ImageFile['orientation'], columnWidth: number): number {
  const aspectRatio = orientation === 'portrait' ? 3 / 4 : 4 / 3; // width / height
  return columnWidth / aspectRatio;
}

export interface VirtualImageMasonryProps {
  images: ImageFile[];
  onImageClick: (image: ImageFile) => void;
  onDelete: (id: string) => Promise<void>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  layoutKey?: string | number;
}

export default function VirtualImageMasonry({
  images,
  onImageClick,
  onDelete,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  layoutKey,
}: VirtualImageMasonryProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);
  const lastFetchTriggerIndexRef = useRef(-1);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const updateWidth = () => {
      setContainerWidth(el.clientWidth);
    };

    updateWidth();

    const ro = new ResizeObserver(() => {
      updateWidth();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const nextMargin = el.getBoundingClientRect().top + window.scrollY;
    setScrollMargin((prev) => (Math.abs(prev - nextMargin) > 1 ? nextMargin : prev));
  }, [containerWidth, layoutKey]);

  const lanes = useMemo(() => getLaneCount(containerWidth), [containerWidth]);
  const columnWidth = useMemo(() => getColumnWidth(containerWidth, lanes), [containerWidth, lanes]);
  const overscan = Math.max(12, lanes * 8);

  const rowVirtualizer = useWindowVirtualizer<HTMLDivElement>({
    count: images.length,
    estimateSize: (index) => {
      const image = images[index];
      if (!image) return 0;
      return estimateCardHeight(image.orientation, columnWidth);
    },
    getItemKey: (index) => images[index]?.id ?? index,
    overscan,
    lanes,
    scrollMargin,
    gap: GUTTER_PX,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, columnWidth, lanes]);

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    if (images.length === 0) return;
    if (lastVirtualIndex < 0) return;

    const remainingThreshold = lanes * 10;
    const triggerIndex = Math.max(0, images.length - 1 - remainingThreshold);

    if (lastVirtualIndex < triggerIndex) return;
    if (lastFetchTriggerIndexRef.current === lastVirtualIndex) return;

    lastFetchTriggerIndexRef.current = lastVirtualIndex;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, images.length, lanes, lastVirtualIndex]);

  return (
    <div ref={parentRef}>
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const image = images[virtualItem.index];
          if (!image) return null;

          const x = virtualItem.lane * (columnWidth + GUTTER_PX);
          const y = virtualItem.start - scrollMargin;

          return (
            <div
              key={image.id}
              data-index={virtualItem.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${columnWidth}px`,
                transform: `translate3d(${x}px, ${y}px, 0)`,
                boxSizing: 'border-box',
              }}
            >
              <ImageCard
                image={image}
                onClick={() => onImageClick(image)}
                onDelete={onDelete}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
