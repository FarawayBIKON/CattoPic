import { ImageFile } from "../types";
import { ImageData } from "../types/image";
import { getFormatLabel, getOrientationLabel, formatFileSize } from "../utils/imageUtils";

type ImageType = ImageFile | (ImageData & { status: 'success' });

interface ImageInfoProps {
  image: ImageType;
}

export const ImageInfo = ({ image }: ImageInfoProps) => {
  // 判断图片类型
  const isImageFile = 'urls' in image && 'sizes' in image;

  // 获取展示信息
  const format = (image.format || '').toLowerCase();
  const orientation = image.orientation || '';
  const size = isImageFile ? (image as ImageFile).sizes?.original || 0 : 0;
  const width = 'width' in image ? image.width : undefined;
  const height = 'height' in image ? image.height : undefined;
  const expiryTime = 'expiryTime' in image ? image.expiryTime : undefined;

  // 构建紧凑的标签数据
  const tags = [
    format && {
      label: getFormatLabel(format),
      bg: 'bg-blue-100 dark:bg-blue-900/40',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-200 dark:border-blue-800'
    },
    orientation && {
      label: getOrientationLabel(orientation),
      bg: 'bg-violet-100 dark:bg-violet-900/40',
      text: 'text-violet-700 dark:text-violet-300',
      border: 'border-violet-200 dark:border-violet-800'
    },
    isImageFile && size > 0 && {
      label: formatFileSize(size),
      bg: 'bg-emerald-100 dark:bg-emerald-900/40',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-800'
    },
    width && height && {
      label: `${width} × ${height}`,
      bg: 'bg-amber-100 dark:bg-amber-900/40',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-800'
    },
  ].filter(Boolean) as Array<{ label: string; bg: string; text: string; border: string }>;

  return (
    <div className="space-y-3">
      {/* 紧凑标签行 */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, index) => (
            <span
              key={index}
              className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md border ${tag.bg} ${tag.text} ${tag.border}`}
            >
              {tag.label}
            </span>
          ))}
        </div>
      )}

      {/* 过期时间单独显示（如果有） */}
      {expiryTime && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border border-orange-200 dark:border-orange-800/50 rounded-lg">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-orange-500/10">
            <svg className="w-3 h-3 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
              过期时间
            </span>
            <span className="mx-2 text-orange-300 dark:text-orange-700">·</span>
            <span className="text-xs text-orange-800 dark:text-orange-200 font-semibold">
              {new Date(expiryTime).toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
