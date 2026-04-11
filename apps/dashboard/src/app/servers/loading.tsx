import Container from "@/components/container";
import { ServersPageSkeleton } from "@/components/servers/servers-page-skeleton";

export default function Loading() {
    return (
        <Container>
            <ServersPageSkeleton />
        </Container>
    );
}
