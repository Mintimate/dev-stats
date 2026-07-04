/**
 * 将 /u/:platform/:username 独立用户主页路径透明重写到 index.html，
 * 由前端 main.tsx 根据 pathname 判断渲染 UserPage 还是主工坊 App。
 * 仅作用于 /u/* 路径，其余路由（静态资源、/chat、/profile、/leaderboard 等）不受影响。
 */
export const config = {
  matcher: ['/u/:path*'],
};

export function middleware(context) {
  return context.rewrite('/index.html');
}
