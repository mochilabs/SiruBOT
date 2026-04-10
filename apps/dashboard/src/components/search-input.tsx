"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { useDebounce } from "@/hooks/use-debounce";

export function SearchInput({ 
	placeholder = "곡 제목 또는 아티스트 검색...",
	className = "" 
}: { 
	placeholder?: string;
	className?: string;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [value, setValue] = useState(searchParams.get("query") || "");
	const debouncedValue = useDebounce<string>(value, 400);

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
		
		// Reset page when search term changes
		params.delete("page"); 

		const search = params.toString();
		const queryStr = search ? `?${search}` : "";
		
		router.push(`/track${queryStr}`, { scroll: false });
	}, [debouncedValue, router, searchParams]);

	return (
		<div className={`relative group ${className}`}>
			<div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
			
			<Search className="absolute z-10 left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
			
			<input
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder={placeholder}
				className="w-full h-14 pl-12 pr-12 bg-card/30 backdrop-blur-md border border-white/5 rounded-2xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all text-lg font-medium shadow-xl shadow-black/5"
			/>

			{value && (
				<button
					onClick={() => setValue("")}
					className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
				>
					<X className="h-4 w-4" />
				</button>
			)}
		</div>
	);
}
