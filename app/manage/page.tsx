"use client";

import { useState, useEffect, useRef } from "react";

import { motion } from 'motion/react';
import ApiKeyModal from "../components/ApiKeyModal";
import ImageFilters from "../components/ImageFilters";
import ImageModal from "../components/ImageModal";
import VirtualImageMasonry from "../components/VirtualImageMasonry";
import { useApiKey } from "../hooks/useApiKey";
import { useTheme } from "../hooks/useTheme";
import {
  ImageFile,
  StatusMessage,
  ImageFilterState,
} from "../types";
import Header from "../components/Header";
import ToastContainer from "../components/ToastContainer";
import TagManagementModal from "../components/TagManagementModal";
import RandomApiModal from "../components/RandomApiModal";
import { ImageIcon, Spinner } from "../components/ui/icons";
import { useInfiniteImages, useDeleteImage } from "../hooks/useImages";

export default function Manage() {
  useTheme();
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showRandomApiModal, setShowRandomApiModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [filters, setFilters] = useState<ImageFilterState>({
    format: "all",
    orientation: "all",
    tag: "",
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const autoFetchAttemptsRef = useRef(0);
  const apiKey = useApiKey();
  const hasApiKey = typeof apiKey === "string" && apiKey.length > 0;

  // TanStack Query hooks
  const {
    images,
    total: totalImages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    error: queryError,
  } = useInfiniteImages({
    tag: filters.tag || undefined,
    orientation: filters.orientation === 'all' ? undefined : filters.orientation,
    format: filters.format,
    limit: 24,
    enabled: hasApiKey,
  });

  const deleteImageMutation = useDeleteImage();

  const isUnauthorized = queryError instanceof Error
    && queryError.message.toLowerCase().includes("unauthorized");
  const isKeyVerified = hasApiKey && !isUnauthorized;
  const isApiKeyReady = apiKey !== undefined;
  const isApiKeyModalOpen = showApiKeyModal || apiKey === null || isUnauthorized;

  const displayStatus = status
    || (isUnauthorized ? { type: "error", message: "API Key无效,请重新验证" } : null)
    || (queryError ? { type: "error", message: "加载图片列表失败" } : null);

  // If current filters result in 0 items but there are more pages, auto-fetch a few pages to find matches.
  useEffect(() => {
    autoFetchAttemptsRef.current = 0;
  }, [filters.format, filters.orientation, filters.tag]);

  useEffect(() => {
    if (isLoading || isFetchingNextPage) return;
    if (!hasNextPage) return;
    if (images.length > 0) return;
    if (autoFetchAttemptsRef.current >= 5) return;
    autoFetchAttemptsRef.current += 1;
    void fetchNextPage();
  }, [images.length, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage]);

  const handleDelete = async (id: string) => {
    // 使用 mutate 而不是 mutateAsync，因为乐观更新会立即移除图片
    // 不需要等待 API 响应，错误会通过 mutation 的 onError 处理
    deleteImageMutation.mutate(id, {
      onError: () => {
        setStatus({
          type: "error",
          message: "删除失败，已恢复",
        });
      },
    });
  };

  // TanStack Query automatically refetches when filters change (via queryKey)
  // No need for manual fetch effect

  // 当关闭标签管理弹窗时刷新图片列表（因为可能删除了标签和关联图片）
  const handleTagModalClose = () => {
    setShowTagModal(false);
    if (isKeyVerified) {
      refetch();
    }
  };

  const handleFilterChange = (
    format: string,
    orientation: string,
    tag: string
  ) => {
    setFilters({ format, orientation, tag });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <Header
        onApiKeyClick={() => setShowApiKeyModal(true)}
        onTagManageClick={() => setShowTagModal(true)}
        onRandomApiClick={() => setShowRandomApiModal(true)}
        title="CattoPic"
        isKeyVerified={isKeyVerified}
      />

	      <ToastContainer />

	      <>
	          {displayStatus && (
	            <motion.div
	              initial={{ opacity: 0, y: -20 }}
	              animate={{ opacity: 1, y: 0 }}
	              exit={{ opacity: 0, y: -20 }}
	              className={`mb-8 p-4 rounded-xl ${
	                displayStatus.type === "success"
	                  ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
	                  : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
	              }`}
	            >
	              {displayStatus.message}
	            </motion.div>
	          )}

	          <ImageFilters onFilterChange={handleFilterChange} />

	          {!isApiKeyReady ? (
	            <div className="flex justify-center items-center h-64">
	              <Spinner className="h-12 w-12 text-indigo-500" />
	            </div>
	          ) : !isKeyVerified ? (
	            <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-2xl shadow-[0_2px_12px_-3px_rgba(0,0,0,0.08),0_4px_24px_-8px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_12px_-3px_rgba(0,0,0,0.3)] p-8 text-gray-500 dark:text-gray-400 border border-gray-200/80 dark:border-gray-700 ring-1 ring-black/[0.03] dark:ring-white/[0.05]">
	              <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800 mb-4">
	                <ImageIcon className="w-12 h-12 text-gray-400 dark:text-gray-500" />
	              </div>
	              <p className="text-lg font-semibold text-gray-600 dark:text-gray-300">需要 API Key</p>
	              <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">请先验证 API Key 以加载图片列表</p>
	            </div>
	          ) : isLoading ? (
	            <div className="flex justify-center items-center h-64">
	              <Spinner className="h-12 w-12 text-indigo-500" />
	            </div>
	          ) : (
            <>
              {images.length > 0 ? (
                <>
                  <VirtualImageMasonry
                    images={images}
                    layoutKey={`${filters.format}:${filters.orientation}:${filters.tag}:${status?.type ?? ''}:${status?.message ?? ''}`}
                    onImageClick={(image) => {
                      setSelectedImage(image);
                      setIsModalOpen(true);
                    }}
                    onDelete={handleDelete}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    fetchNextPage={fetchNextPage}
                  />
                  {isFetchingNextPage && (
                    <div className="flex justify-center items-center py-8">
                      <Spinner className="h-8 w-8 text-indigo-500" />
                      <span className="ml-2 text-indigo-500">加载更多图片...</span>
                    </div>
                  )}
                  {!isLoading && !isFetchingNextPage && images.length > 0 && !hasNextPage && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      已加载全部图片 ({totalImages}张)
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-2xl shadow-[0_2px_12px_-3px_rgba(0,0,0,0.08),0_4px_24px_-8px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_12px_-3px_rgba(0,0,0,0.3)] p-8 text-gray-500 dark:text-gray-400 border border-gray-200/80 dark:border-gray-700 ring-1 ring-black/[0.03] dark:ring-white/[0.05]">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800 mb-4">
                    <ImageIcon className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                  </div>
                  <p className="text-lg font-semibold text-gray-600 dark:text-gray-300">暂无图片</p>
                  <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">请上传图片或调整筛选条件</p>
                </div>
              )}
            </>
          )}

          <ImageModal
            image={selectedImage}
            isOpen={isModalOpen}
            onClose={() => {
              setSelectedImage(null);
              setIsModalOpen(false);
            }}
            onDelete={handleDelete}
          />
        </>

      <TagManagementModal
        isOpen={showTagModal}
        onClose={handleTagModalClose}
      />

      <RandomApiModal
        isOpen={showRandomApiModal}
        onClose={() => setShowRandomApiModal(false)}
      />

		      <ApiKeyModal
		        isOpen={isApiKeyModalOpen}
		        onClose={() => setShowApiKeyModal(false)}
		        onSuccess={() => {
		          setShowApiKeyModal(false);
		          setStatus(null);
		          refetch();
		        }}
		      />
	    </div>
	  );
}
