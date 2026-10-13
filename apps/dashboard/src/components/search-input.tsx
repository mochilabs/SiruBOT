"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { useSearchStore } from "@/store/use-search-store";

export function SearchInput({ 
	placeholder = "어떤 노래를 찾아볼까요?",
	className = "",
	basePath = "/track"
}: { 
	placeholder?: string;
	className?: string;
	basePath?: string;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { value, setValue, clear } = useSearchStore();
	const debouncedValue = useDebounce<string>(value, 400);

	useEffect(() => {
		const urlQuery = searchParams.get("query") || "";
		if (urlQuery !== value) {
			setValue(urlQuery);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const currentQuery = searchParams.get("query") || "";
		
		if (currentQuery === debouncedValue) {
			return;
		}

		const params = new URLSearchParams(searchParams.toString());
		if (debouncedValue) {
			params.set("query", debouncedValue);
		} else {
			params.delete("query");
		}
		
		params.delete("page"); 

		const search = params.toString();
		const queryStr = search ? `?${search}` : "";
		
		router.push(`${basePath}${queryStr}`, { scroll: false });
	}, [debouncedValue, router, searchParams, basePath]);

	return (
		<div className={`relative group ${className}`}>
			<div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-slow" />
			
			<Search className="absolute z-10 left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary-text" />
			
			<Input
				type="text"
				value={value}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
				placeholder={placeholder}
				className="h-12 w-full rounded-card bg-card pl-12 pr-12 text-base font-medium shadow-sm transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:h-14 sm:text-lg"
			/>

			{value && (
				// ghost variant — icon variant의 shadow-control-boundary가 덮어쓰기에도 남아서 링처럼 보였어요
				<Button
					variant="ghost"
					onClick={clear}
					aria-label="검색어 지우기"
					className="absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-primary-control/10 hover:text-primary-text"
				>
					<X className="h-4 w-4" />
				</Button>
			)}
		</div>
	);
}
