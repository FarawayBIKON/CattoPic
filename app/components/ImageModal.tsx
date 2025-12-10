"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from 'motion/react';
import { ImageFile } from "../types";
import { ImageData } from "../types/image";
import { ImageInfo } from "./ImageInfo";
import { ImageUrls } from "./ImageUrls";
import { DeleteConfirm } from "./DeleteConfirm";
import { Cross1Icon, TrashIcon } from "./ui/icons";

// 统一的图片类型，可以接受管理界面和上传界面的两种不同图片对象
type ImageType = ImageFile | (ImageData & { status: 'success' });

interface ImageModalProps {
  image: ImageType | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: (id: string) => Promise<void>;
}

export default function ImageModal({ image, isOpen, onClose, onDelete }: ImageModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowDeleteConfirm(false);
      setIsDeleting(false);
    }
  }, [isOpen]);

  const handleDelete = () => {
    if (!image || !onDelete || !image.id) return;

    // 立即关闭弹窗，乐观更新会处理 UI
    setShowDeleteConfirm(false);
    onClose();

    // 触发删除，不等待结果
    onDelete(image.id).catch((err) => {
      console.error("删除失败:", err);
    });
  };

  if (!image) return null;

  // 判断是否有可删除的功能
  const canDelete = onDelete && image.id;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative bg-white dark:bg-gray-900 rounded-2xl overflow-hidden w-full max-w-xl max-h-[85vh] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] dark:shadow-2xl border border-gray-200/80 dark:border-gray-700/50 ring-1 ring-black/[0.05] dark:ring-white/[0.05]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 - 渐变背景 */}
            <div className="relative overflow-hidden">
              {/* 背景装饰 */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-90" />
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />

              <div className="relative px-6 py-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-4">
                    <h3 className="text-lg font-bold text-white truncate leading-tight">
                      {image.originalName}
                    </h3>
                    <p className="text-sm text-white/70 mt-1">图片详情</p>
                  </div>
                  <button
                    className="flex-shrink-0 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                    onClick={onClose}
                  >
                    <Cross1Icon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* 内容区域 */}
            <div className="overflow-y-auto max-h-[calc(85vh-10rem)]">
              {/* 图片元信息 - 紧凑区域 */}
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                <ImageInfo image={image} />
              </div>

              {/* 链接区域 - 主要内容 */}
              <div className="px-6 py-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-5 rounded-full bg-gradient-to-b from-violet-500 to-purple-500" />
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">快速复制</h4>
                </div>
                <ImageUrls image={image} />
              </div>
            </div>

            {/* 底部操作区域 */}
            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50">
              {canDelete && !showDeleteConfirm && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="group flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
                >
                  <TrashIcon className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  删除图片
                </button>
              )}

              {showDeleteConfirm && (
                <div className="flex gap-2">
                  <DeleteConfirm
                    isDeleting={isDeleting}
                    onCancel={() => setShowDeleteConfirm(false)}
                    onConfirm={handleDelete}
                  />
                </div>
              )}

              {(!canDelete || !showDeleteConfirm) && <div />}

              <button
                onClick={onClose}
                className="px-5 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                关闭
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
