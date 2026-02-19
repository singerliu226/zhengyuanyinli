"use client";

import { useState } from "react";

/**
 * 全局浮动客服按钮
 *
 * 固定在左下角，点击弹出微信号卡片。
 * 所有需要客服入口的页面引入即可，统一维护微信号。
 */

const WECHAT_ID = "musinic";

export default function CustomerService() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(WECHAT_ID).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 left-4 z-40 flex items-center gap-1.5 bg-white border border-gray-200 shadow-md rounded-full px-3 py-2 text-xs text-gray-500 hover:shadow-lg transition-shadow"
        aria-label="联系客服"
      >
        <span className="text-sm">💬</span>
        <span>客服</span>
      </button>

      {/* 弹出卡片 */}
      {open && (
        <>
          {/* 遮罩 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* 卡片 */}
          <div className="fixed bottom-16 left-4 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-52">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">联系客服</span>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="bg-green-50 rounded-xl p-3 text-center mb-3">
              <div className="text-2xl mb-1">💚</div>
              <p className="text-xs text-gray-500 mb-1">微信号</p>
              <p className="text-base font-bold text-gray-800 tracking-widest">{WECHAT_ID}</p>
            </div>

            <button
              onClick={handleCopy}
              className="w-full py-2 rounded-xl text-xs font-medium bg-green-500 text-white transition-colors hover:bg-green-600"
            >
              {copied ? "✅ 已复制" : "复制微信号"}
            </button>

            <p className="text-center text-gray-400 text-xs mt-2 leading-relaxed">
              激活 / 支付 / 使用问题<br />均可加微信咨询
            </p>
          </div>
        </>
      )}
    </>
  );
}
