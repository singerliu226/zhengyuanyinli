"use client";

import { useState, useEffect } from "react";

/**
 * 客服浮动按钮（条件可见版）
 *
 * 渲染条件：
 * 1. 传入 token → 请求 /api/contact-visible 检查数据库：
 *    - 用户曾发过 AI 对话消息，OR 有已完成的充值订单
 * 2. extraVisible=true → 跳过接口，直接显示（用于对话中发完第一条消息后实时展示）
 *
 * 未传 token 且 extraVisible=false 时：组件不渲染（保护首页/激活页访客）
 */

const WECHAT_ID = "musinic";

type Props = {
  /** 用户的 JWT result token，有 token 才做服务端可见性校验 */
  token?: string;
  /** 强制可见（父组件在特定操作后置为 true，如发送第一条消息）*/
  extraVisible?: boolean;
  /**
   * 浮动按钮的定位 class，默认 "fixed bottom-6 left-4 z-40"
   * 在有底部输入框的页面（如聊天页）传入更高的 bottom 值避免遮挡
   */
  buttonClassName?: string;
};

export default function CustomerService({ token, extraVisible = false, buttonClassName }: Props) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (extraVisible) {
      setVisible(true);
      return;
    }
    if (!token) return;

    fetch(`/api/contact-visible?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.visible) setVisible(true);
      })
      .catch(() => {});
  }, [token, extraVisible]);

  // extraVisible 变化时实时更新（如用户刚发完第一条消息）
  useEffect(() => {
    if (extraVisible) setVisible(true);
  }, [extraVisible]);

  if (!visible) return null;

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
        className={buttonClassName ?? "fixed bottom-6 left-4 z-40 flex items-center gap-1.5 bg-white border border-gray-200 shadow-md rounded-full px-3 py-2 text-xs text-gray-500 hover:shadow-lg transition-shadow"}
        aria-label="联系客服"
      >
        <span className="text-sm">💬</span>
        <span>客服</span>
      </button>

      {/* 弹出卡片 */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed bottom-16 left-4 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-52">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">联系客服</span>
              <button onClick={() => setOpen(false)} className="text-gray-400 text-xs">✕</button>
            </div>

            <div className="bg-green-50 rounded-xl p-3 text-center mb-3">
              <div className="text-2xl mb-1">💚</div>
              <p className="text-xs text-gray-500 mb-1">微信号</p>
              <p className="text-base font-bold text-gray-800 tracking-widest">{WECHAT_ID}</p>
            </div>

            <button
              onClick={handleCopy}
              className="w-full py-2 rounded-xl text-xs font-medium bg-green-500 text-white hover:bg-green-600 transition-colors"
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
