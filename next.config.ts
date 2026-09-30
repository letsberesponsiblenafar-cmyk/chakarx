import type {NextConfig} from 'next';
const nextConfig:NextConfig={reactStrictMode:true,turbopack:{root:process.cwd()},serverExternalPackages:['pdf-parse','@napi-rs/canvas']};
export default nextConfig;
